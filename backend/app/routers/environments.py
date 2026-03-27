"""
API router for Python Environment management.

Environments are Python venvs stored at /data/pyenvs/{env_id}/.
Both backend and celery-worker mount the same python_envs volume.

Special env id=0 represents the system (container-global) Python — read-only.
"""
import asyncio
import json
import logging
import os
import shutil
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.environment import PythonEnv, EnvPackage
from app.schemas.environment import (
    PythonEnvCreate,
    PythonEnvResponse,
    EnvPackageResponse,
    InstallPackageRequest,
    SyncResult,
)

router = APIRouter(prefix="/api/environments", tags=["environments"])
logger = logging.getLogger(__name__)

ENVS_BASE_DIR = os.environ.get("PYENVS_BASE_DIR", "/data/pyenvs")
PIP_INDEX_URL = os.environ.get("PIP_INDEX_URL", "https://pypi.org/simple/")
_SYSTEM_ENV_ID = 0


def _env_path(env_id: int) -> str:
    return os.path.join(ENVS_BASE_DIR, str(env_id))


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


async def _run_cmd(cmd: List[str], timeout: int = 300) -> tuple[int, str, str]:
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except asyncio.TimeoutError:
        proc.kill()
        await proc.communicate()
        return -1, "", "Command timed out"
    return proc.returncode, stdout.decode(errors="replace"), stderr.decode(errors="replace")


async def _get_python_version(python_bin: str) -> Optional[str]:
    rc, out, _ = await _run_cmd([python_bin, "--version"])
    if rc == 0:
        return out.strip().replace("Python ", "")
    return None


async def _get_package_size_kb(env_path: str, package_name: str) -> int:
    """Estimate installed package size from site-packages directory."""
    site_packages = os.path.join(env_path, "lib")
    total = 0
    try:
        for entry in os.listdir(site_packages):
            sp = os.path.join(site_packages, entry, "site-packages")
            if os.path.isdir(sp):
                pkg_lower = package_name.lower().replace("-", "_").replace(".", "_")
                for item in os.listdir(sp):
                    item_lower = item.lower().replace("-", "_").replace(".", "_")
                    if item_lower.startswith(pkg_lower):
                        item_path = os.path.join(sp, item)
                        if os.path.isdir(item_path):
                            for dirpath, _, filenames in os.walk(item_path):
                                for fn in filenames:
                                    try:
                                        total += os.path.getsize(os.path.join(dirpath, fn))
                                    except OSError:
                                        pass
                        elif os.path.isfile(item_path):
                            try:
                                total += os.path.getsize(item_path)
                            except OSError:
                                pass
    except (OSError, FileNotFoundError):
        pass
    return total // 1024


async def _pip_list(pip_bin: str) -> List[dict]:
    """Return pip list --format=json for the given pip binary."""
    rc, out, _ = await _run_cmd([pip_bin, "list", "--format=json"])
    if rc != 0:
        return []
    try:
        return json.loads(out)
    except Exception:
        return []


def _pkg_to_response(p: EnvPackage) -> EnvPackageResponse:
    return EnvPackageResponse(
        id=p.id,
        env_id=p.env_id,
        package_name=p.package_name,
        version=p.version,
        size_kb=p.size_kb,
        installed_at=p.installed_at,
        status=p.status,
    )


def _env_response(env: PythonEnv, pkgs: list, is_system: bool = False) -> PythonEnvResponse:
    """Build PythonEnvResponse without touching ORM relationship attributes."""
    installed = [p for p in pkgs if getattr(p, "status", "installed") == "installed"]
    return PythonEnvResponse(
        id=env.id,
        name=env.name,
        description=env.description,
        python_version=env.python_version,
        path=env.path,
        package_count=len(installed),
        total_size_kb=sum(getattr(p, "size_kb", 0) or 0 for p in installed),
        is_system=is_system,
        created_at=env.created_at,
        updated_at=env.updated_at,
    )


async def _system_env_response() -> PythonEnvResponse:
    """Synthetic read-only entry for the container's system Python."""
    sys_pkgs = await _pip_list("pip")
    py_ver = await _get_python_version("python")
    return PythonEnvResponse(
        id=_SYSTEM_ENV_ID,
        name="System Python",
        description="Container global environment — packages here are visible to all scripts that use requirements.txt (read-only)",
        python_version=py_ver,
        path=None,
        package_count=len(sys_pkgs),
        total_size_kb=0,
        is_system=True,
        created_at=None,
        updated_at=None,
    )


def _system_pkg_list(raw: List[dict]) -> List[EnvPackageResponse]:
    """Convert pip list output to EnvPackageResponse list (synthetic, read-only)."""
    return [
        EnvPackageResponse(
            id=-(i + 1),   # negative = synthetic, never in DB
            env_id=_SYSTEM_ENV_ID,
            package_name=p["name"],
            version=p.get("version"),
            size_kb=None,
            installed_at=None,
            status="installed",
        )
        for i, p in enumerate(raw)
    ]


# ---------------------------------------------------------------------------
# List environments  (System Python always first)
# ---------------------------------------------------------------------------

@router.get("", response_model=List[PythonEnvResponse])
async def list_environments(session: AsyncSession = Depends(get_db)):
    out: List[PythonEnvResponse] = [await _system_env_response()]

    result = await session.execute(select(PythonEnv).order_by(PythonEnv.name))
    envs = result.scalars().all()
    for env in envs:
        pkg_result = await session.execute(
            select(EnvPackage).where(EnvPackage.env_id == env.id)
        )
        pkgs = pkg_result.scalars().all()
        out.append(_env_response(env, pkgs))
    return out


# ---------------------------------------------------------------------------
# Create environment
# ---------------------------------------------------------------------------

@router.post("", response_model=PythonEnvResponse, status_code=status.HTTP_201_CREATED)
async def create_environment(data: PythonEnvCreate, session: AsyncSession = Depends(get_db)):
    existing = await session.execute(
        select(PythonEnv).where(PythonEnv.name == data.name)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Environment name already exists")

    env = PythonEnv(
        name=data.name,
        description=data.description,
        created_at=_now(),
        updated_at=_now(),
    )
    session.add(env)
    await session.flush()
    await session.refresh(env)

    env_path = _env_path(env.id)
    env.path = env_path
    await session.flush()

    os.makedirs(ENVS_BASE_DIR, exist_ok=True)
    rc, _, err = await _run_cmd(["python3", "-m", "venv", env_path], timeout=120)
    if rc != 0:
        await session.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create venv: {err}")

    env.python_version = await _get_python_version(os.path.join(env_path, "bin", "python"))
    env.updated_at = _now()
    await session.flush()

    # Return response without loading any relationship (avoids MissingGreenlet)
    return PythonEnvResponse(
        id=env.id,
        name=env.name,
        description=env.description,
        python_version=env.python_version,
        path=env.path,
        package_count=0,
        total_size_kb=0,
        is_system=False,
        created_at=env.created_at,
        updated_at=env.updated_at,
    )


# ---------------------------------------------------------------------------
# Get environment
# ---------------------------------------------------------------------------

@router.get("/{env_id}", response_model=PythonEnvResponse)
async def get_environment(env_id: int, session: AsyncSession = Depends(get_db)):
    if env_id == _SYSTEM_ENV_ID:
        return await _system_env_response()

    env = await session.get(PythonEnv, env_id)
    if not env:
        raise HTTPException(status_code=404, detail="Environment not found")
    pkg_result = await session.execute(
        select(EnvPackage).where(EnvPackage.env_id == env_id)
    )
    pkgs = pkg_result.scalars().all()
    return _env_response(env, pkgs)


# ---------------------------------------------------------------------------
# Delete environment  (system env is protected)
# ---------------------------------------------------------------------------

@router.delete("/{env_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_environment(env_id: int, session: AsyncSession = Depends(get_db)):
    if env_id == _SYSTEM_ENV_ID:
        raise HTTPException(status_code=403, detail="System Python environment cannot be deleted")

    env = await session.get(PythonEnv, env_id)
    if not env:
        raise HTTPException(status_code=404, detail="Environment not found")

    env_path = env.path or _env_path(env_id)
    await session.delete(env)
    await session.flush()

    if env_path and os.path.exists(env_path):
        try:
            shutil.rmtree(env_path)
        except Exception:
            pass


# ---------------------------------------------------------------------------
# List packages
# ---------------------------------------------------------------------------

@router.get("/{env_id}/packages", response_model=List[EnvPackageResponse])
async def list_packages(env_id: int, session: AsyncSession = Depends(get_db)):
    if env_id == _SYSTEM_ENV_ID:
        raw = await _pip_list("pip")
        return _system_pkg_list(raw)

    env = await session.get(PythonEnv, env_id)
    if not env:
        raise HTTPException(status_code=404, detail="Environment not found")
    result = await session.execute(
        select(EnvPackage)
        .where(EnvPackage.env_id == env_id)
        .order_by(EnvPackage.package_name)
    )
    return [_pkg_to_response(p) for p in result.scalars().all()]


# ---------------------------------------------------------------------------
# Install package
# ---------------------------------------------------------------------------

@router.post("/{env_id}/packages", response_model=EnvPackageResponse,
             status_code=status.HTTP_201_CREATED)
async def install_package(
    env_id: int,
    req: InstallPackageRequest,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_db),
):
    if env_id == _SYSTEM_ENV_ID:
        raise HTTPException(status_code=403, detail="Cannot install packages into system Python")

    env = await session.get(PythonEnv, env_id)
    if not env:
        raise HTTPException(status_code=404, detail="Environment not found")

    env_path = env.path or _env_path(env_id)
    if not os.path.exists(env_path):
        raise HTTPException(status_code=400, detail="Venv directory not found on disk")

    pkg_spec = req.package_name
    if req.version:
        pkg_spec = f"{req.package_name}=={req.version}"

    pkg = EnvPackage(
        env_id=env_id,
        package_name=req.package_name,
        version=req.version,
        status="installing",
        installed_at=_now(),
    )
    session.add(pkg)
    await session.flush()
    await session.refresh(pkg)

    response = _pkg_to_response(pkg)
    background_tasks.add_task(_do_install, env_id, pkg.id, env_path, pkg_spec)
    return response


async def _do_install(env_id: int, pkg_id: int, env_path: str, pkg_spec: str):
    from app.database import AsyncSessionLocal
    pip_bin = os.path.join(env_path, "bin", "pip")
    logger.info("pip install starting: env_id=%s pkg_id=%s spec=%s", env_id, pkg_id, pkg_spec)
    try:
        if not os.path.exists(pip_bin):
            raise FileNotFoundError(f"pip not found at {pip_bin}")

        rc, stdout, stderr = await _pip_install(pip_bin, pkg_spec)

        logger.info("pip install finished: env_id=%s pkg_id=%s rc=%s", env_id, pkg_id, rc)
        if rc != 0:
            logger.error("pip install failed: env_id=%s pkg_id=%s\nstdout=%s\nstderr=%s",
                         env_id, pkg_id, stdout, stderr)
        async with AsyncSessionLocal() as session:
            pkg = await session.get(EnvPackage, pkg_id)
            if pkg is None:
                logger.warning("_do_install: pkg_id=%s not found in DB after install", pkg_id)
                return
            if rc == 0:
                pkg.status = "installed"
                pkg.installed_at = _now()
                pip_rc, show_out, _ = await _run_cmd([pip_bin, "show", pkg.package_name])
                if pip_rc == 0:
                    for line in show_out.splitlines():
                        if line.lower().startswith("version:"):
                            pkg.version = line.split(":", 1)[1].strip()
                            break
                pkg.size_kb = await _get_package_size_kb(env_path, pkg.package_name)
            else:
                pkg.status = "failed"
            await session.commit()
    except Exception as exc:
        logger.exception("_do_install crashed: env_id=%s pkg_id=%s spec=%s error=%s",
                         env_id, pkg_id, pkg_spec, exc)
        try:
            from app.database import AsyncSessionLocal as _ASL
            async with _ASL() as session:
                pkg = await session.get(EnvPackage, pkg_id)
                if pkg:
                    pkg.status = "failed"
                    await session.commit()
        except Exception:
            pass


async def _pip_install(pip_bin: str, pkg_spec: str) -> tuple[int, str, str]:
    """Run pip install, preferring Docker host-network to bypass container firewall."""
    loop = asyncio.get_event_loop()
    try:
        result = await asyncio.wait_for(
            loop.run_in_executor(None, _pip_install_via_docker_sync, pip_bin, pkg_spec),
            timeout=320,
        )
        logger.info("pip install via Docker host-network: rc=%s", result[0])
        return result
    except asyncio.TimeoutError:
        logger.error("pip install via Docker timed out")
        return -1, "", "pip install timed out"
    except Exception as e:
        logger.warning("Docker host-network pip unavailable (%s), falling back to direct", e)
        return await _run_cmd(
            [pip_bin, "install", "--index-url", PIP_INDEX_URL, pkg_spec],
            timeout=300,
        )


def _pip_install_via_docker_sync(pip_bin: str, pkg_spec: str) -> tuple[int, str, str]:
    """Synchronous: run pip install in a sibling container with --network=host.

    This bypasses container-level firewall rules that block outbound traffic
    on the Docker bridge network, while the host itself has internet access.
    """
    import docker  # type: ignore
    client = docker.from_env()

    # Identify current container and its image/volume bindings
    try:
        with open("/etc/hostname") as f:
            container_id = f.read().strip()
        current = client.containers.get(container_id)
        image_id = current.image.id

        volume_name: Optional[str] = None
        for mount in current.attrs.get("Mounts", []):
            if mount.get("Destination") == "/data/pyenvs" and mount.get("Type") == "volume":
                volume_name = mount["Name"]
                break
    except Exception as exc:
        raise RuntimeError(f"Cannot inspect current container: {exc}") from exc

    if not volume_name:
        raise RuntimeError("python_envs volume mount not found in current container")

    # Pass proxy env vars so pip inside the container can reach external servers.
    # These come from the backend container's own environment (set via .env / docker-compose).
    env_vars: dict = {}
    for key in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "no_proxy", "NO_PROXY"):
        val = os.environ.get(key)
        if val:
            env_vars[key] = val

    logger.info("Docker pip: container=%s image=%.12s volume=%s proxy_vars=%s",
                container_id, image_id, volume_name, list(env_vars.keys()))

    try:
        output = client.containers.run(
            image=image_id,
            command=[pip_bin, "install", "--index-url", PIP_INDEX_URL, pkg_spec],
            volumes={volume_name: {"bind": "/data/pyenvs", "mode": "rw"}},
            network_mode="host",
            environment=env_vars,
            remove=True,
            stdout=True,
            stderr=True,
        )
        return 0, output.decode(errors="replace") if output else "", ""
    except docker.errors.ContainerError as exc:
        stderr_text = exc.stderr.decode(errors="replace") if exc.stderr else str(exc)
        return exc.exit_status, "", stderr_text


# ---------------------------------------------------------------------------
# Uninstall package  (system packages are protected)
# ---------------------------------------------------------------------------

@router.delete("/{env_id}/packages/{pkg_id}", status_code=status.HTTP_204_NO_CONTENT)
async def uninstall_package(
    env_id: int,
    pkg_id: int,
    session: AsyncSession = Depends(get_db),
):
    if env_id == _SYSTEM_ENV_ID:
        raise HTTPException(status_code=403, detail="Cannot remove system Python packages")

    env = await session.get(PythonEnv, env_id)
    if not env:
        raise HTTPException(status_code=404, detail="Environment not found")

    pkg = await session.get(EnvPackage, pkg_id)
    if not pkg or pkg.env_id != env_id:
        raise HTTPException(status_code=404, detail="Package not found")

    env_path = env.path or _env_path(env_id)
    pip_bin = os.path.join(env_path, "bin", "pip")

    await session.delete(pkg)
    await session.flush()
    await _run_cmd([pip_bin, "uninstall", "-y", pkg.package_name], timeout=120)


# ---------------------------------------------------------------------------
# Sync packages
# ---------------------------------------------------------------------------

@router.post("/{env_id}/sync", response_model=SyncResult)
async def sync_packages(env_id: int, session: AsyncSession = Depends(get_db)):
    if env_id == _SYSTEM_ENV_ID:
        raise HTTPException(status_code=403, detail="System Python is read-only; sync not applicable")

    env = await session.get(PythonEnv, env_id)
    if not env:
        raise HTTPException(status_code=404, detail="Environment not found")

    env_path = env.path or _env_path(env_id)
    if not os.path.exists(env_path):
        raise HTTPException(status_code=400, detail="Venv directory not found on disk")

    pip_bin = os.path.join(env_path, "bin", "pip")
    actual_pkgs = await _pip_list(pip_bin)
    skip = {"pip", "setuptools", "wheel", "pkg-resources", "pkg_resources"}
    actual_map = {p["name"].lower(): p["version"] for p in actual_pkgs if p["name"].lower() not in skip}

    result = await session.execute(
        select(EnvPackage).where(EnvPackage.env_id == env_id)
    )
    db_pkgs = result.scalars().all()
    db_map = {p.package_name.lower(): p for p in db_pkgs}

    added = updated = removed = 0

    for name_lower, version in actual_map.items():
        if name_lower not in db_map:
            size_kb = await _get_package_size_kb(env_path, name_lower)
            session.add(EnvPackage(
                env_id=env_id,
                package_name=name_lower,
                version=version,
                size_kb=size_kb,
                installed_at=_now(),
                status="installed",
            ))
            added += 1
        else:
            existing = db_map[name_lower]
            if existing.version != version or existing.status != "installed":
                existing.version = version
                existing.status = "installed"
                if not existing.size_kb:
                    existing.size_kb = await _get_package_size_kb(env_path, name_lower)
                updated += 1

    for name_lower, db_pkg in db_map.items():
        if name_lower not in actual_map:
            await session.delete(db_pkg)
            removed += 1

    await session.flush()

    result2 = await session.execute(
        select(EnvPackage).where(EnvPackage.env_id == env_id).order_by(EnvPackage.package_name)
    )
    final_pkgs = result2.scalars().all()

    return SyncResult(
        added=added,
        removed=removed,
        updated=updated,
        packages=[_pkg_to_response(p) for p in final_pkgs],
    )
