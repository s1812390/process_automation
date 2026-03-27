"""
API router for Python Environment management.

Environments are Python venvs stored at /data/pyenvs/{env_id}/ inside the
celery-worker container (shared volume python_envs:/data/pyenvs).
The backend container also mounts this volume so it can create venvs and
run pip commands.
"""
import asyncio
import json
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

ENVS_BASE_DIR = os.environ.get("PYENVS_BASE_DIR", "/data/pyenvs")
PIP_INDEX_URL = os.environ.get("PIP_INDEX_URL", "https://mirrors.tencent.com/pypi/simple/")


def _env_path(env_id: int) -> str:
    return os.path.join(ENVS_BASE_DIR, str(env_id))


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


async def _run_cmd(cmd: List[str], timeout: int = 300) -> tuple[int, str, str]:
    """Run a shell command asynchronously, return (returncode, stdout, stderr)."""
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


async def _get_python_version(env_path: str) -> Optional[str]:
    python_bin = os.path.join(env_path, "bin", "python")
    rc, out, _ = await _run_cmd([python_bin, "--version"])
    if rc == 0:
        return out.strip().replace("Python ", "")
    return None


async def _get_package_size_kb(env_path: str, package_name: str) -> int:
    """Estimate installed package size from dist-info directory."""
    site_packages = os.path.join(env_path, "lib")
    total = 0
    try:
        # Find lib/pythonX.Y/site-packages
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
    return total // 1024  # bytes → KB


async def _pip_list(env_path: str) -> List[dict]:
    """Return list of installed packages via pip list --format=json."""
    pip_bin = os.path.join(env_path, "bin", "pip")
    rc, out, _ = await _run_cmd([pip_bin, "list", "--format=json"])
    if rc != 0:
        return []
    try:
        return json.loads(out)
    except Exception:
        return []


def _build_env_response(env: PythonEnv) -> dict:
    pkgs = [p for p in (env.packages or []) if p.status == "installed"]
    total_kb = sum(p.size_kb or 0 for p in pkgs)
    return {
        "id": env.id,
        "name": env.name,
        "description": env.description,
        "python_version": env.python_version,
        "path": env.path,
        "package_count": len(pkgs),
        "total_size_kb": total_kb,
        "created_at": env.created_at,
        "updated_at": env.updated_at,
    }


# ---------------------------------------------------------------------------
# List environments
# ---------------------------------------------------------------------------

@router.get("", response_model=List[PythonEnvResponse])
async def list_environments(session: AsyncSession = Depends(get_db)):
    result = await session.execute(select(PythonEnv).order_by(PythonEnv.name))
    envs = result.scalars().all()
    out = []
    for env in envs:
        # Eagerly load packages
        pkg_result = await session.execute(
            select(EnvPackage).where(EnvPackage.env_id == env.id)
        )
        env.packages = pkg_result.scalars().all()
        out.append(PythonEnvResponse(**_build_env_response(env)))
    return out


# ---------------------------------------------------------------------------
# Create environment
# ---------------------------------------------------------------------------

@router.post("", response_model=PythonEnvResponse, status_code=status.HTTP_201_CREATED)
async def create_environment(data: PythonEnvCreate, session: AsyncSession = Depends(get_db)):
    # Check uniqueness
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

    # Create venv
    os.makedirs(ENVS_BASE_DIR, exist_ok=True)
    rc, _, err = await _run_cmd(["python3", "-m", "venv", env_path], timeout=120)
    if rc != 0:
        await session.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create venv: {err}")

    # Detect python version
    env.python_version = await _get_python_version(env_path)
    env.updated_at = _now()
    await session.flush()

    env.packages = []
    return PythonEnvResponse(**_build_env_response(env))


# ---------------------------------------------------------------------------
# Get environment
# ---------------------------------------------------------------------------

@router.get("/{env_id}", response_model=PythonEnvResponse)
async def get_environment(env_id: int, session: AsyncSession = Depends(get_db)):
    env = await session.get(PythonEnv, env_id)
    if not env:
        raise HTTPException(status_code=404, detail="Environment not found")
    pkg_result = await session.execute(
        select(EnvPackage).where(EnvPackage.env_id == env_id)
    )
    env.packages = pkg_result.scalars().all()
    return PythonEnvResponse(**_build_env_response(env))


# ---------------------------------------------------------------------------
# Delete environment
# ---------------------------------------------------------------------------

@router.delete("/{env_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_environment(env_id: int, session: AsyncSession = Depends(get_db)):
    env = await session.get(PythonEnv, env_id)
    if not env:
        raise HTTPException(status_code=404, detail="Environment not found")

    env_path = env.path or _env_path(env_id)
    await session.delete(env)
    await session.flush()

    # Remove filesystem venv (best-effort)
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
    env = await session.get(PythonEnv, env_id)
    if not env:
        raise HTTPException(status_code=404, detail="Environment not found")
    result = await session.execute(
        select(EnvPackage).where(EnvPackage.env_id == env_id).order_by(EnvPackage.package_name)
    )
    pkgs = result.scalars().all()
    return [_pkg_to_response(p) for p in pkgs]


def _pkg_to_response(p: EnvPackage) -> EnvPackageResponse:
    r = EnvPackageResponse(
        id=p.id,
        env_id=p.env_id,
        package_name=p.package_name,
        version=p.version,
        size_kb=p.size_kb,
        installed_at=p.installed_at,
        status=p.status,
    )
    return r


# ---------------------------------------------------------------------------
# Install package (async background install)
# ---------------------------------------------------------------------------

@router.post("/{env_id}/packages", response_model=EnvPackageResponse,
             status_code=status.HTTP_201_CREATED)
async def install_package(
    env_id: int,
    req: InstallPackageRequest,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_db),
):
    env = await session.get(PythonEnv, env_id)
    if not env:
        raise HTTPException(status_code=404, detail="Environment not found")

    env_path = env.path or _env_path(env_id)
    if not os.path.exists(env_path):
        raise HTTPException(status_code=400, detail="Venv directory not found on disk")

    pkg_spec = req.package_name
    if req.version:
        pkg_spec = f"{req.package_name}=={req.version}"

    # Create DB record immediately with status=installing
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
    pkg_id = pkg.id
    response = _pkg_to_response(pkg)

    # Run pip install in background so the request returns quickly
    background_tasks.add_task(_do_install, env_id, pkg_id, env_path, pkg_spec)
    return response


async def _do_install(env_id: int, pkg_id: int, env_path: str, pkg_spec: str):
    """Background task: run pip install and update DB record."""
    from app.database import AsyncSessionLocal
    pip_bin = os.path.join(env_path, "bin", "pip")
    rc, _, err = await _run_cmd(
        [pip_bin, "install", "--index-url", PIP_INDEX_URL, pkg_spec],
        timeout=300,
    )
    async with AsyncSessionLocal() as session:
        pkg = await session.get(EnvPackage, pkg_id)
        if pkg is None:
            return
        if rc == 0:
            pkg.status = "installed"
            pkg.installed_at = _now()
            # Try to get actual installed version via pip show
            pkg_name = pkg.package_name
            pip_rc, show_out, _ = await _run_cmd([pip_bin, "show", pkg_name])
            if pip_rc == 0:
                for line in show_out.splitlines():
                    if line.lower().startswith("version:"):
                        pkg.version = line.split(":", 1)[1].strip()
                        break
            pkg.size_kb = await _get_package_size_kb(env_path, pkg_name)
        else:
            pkg.status = "failed"
        await session.commit()


# ---------------------------------------------------------------------------
# Uninstall package
# ---------------------------------------------------------------------------

@router.delete("/{env_id}/packages/{pkg_id}", status_code=status.HTTP_204_NO_CONTENT)
async def uninstall_package(
    env_id: int,
    pkg_id: int,
    session: AsyncSession = Depends(get_db),
):
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

    # Uninstall from venv (best-effort)
    await _run_cmd([pip_bin, "uninstall", "-y", pkg.package_name], timeout=120)


# ---------------------------------------------------------------------------
# Sync packages: reconcile DB with actual pip list
# ---------------------------------------------------------------------------

@router.post("/{env_id}/sync", response_model=SyncResult)
async def sync_packages(env_id: int, session: AsyncSession = Depends(get_db)):
    env = await session.get(PythonEnv, env_id)
    if not env:
        raise HTTPException(status_code=404, detail="Environment not found")

    env_path = env.path or _env_path(env_id)
    if not os.path.exists(env_path):
        raise HTTPException(status_code=400, detail="Venv directory not found on disk")

    # Get actual installed packages from pip
    actual_pkgs = await _pip_list(env_path)
    # Build a dict {name_lower: version}
    actual_map = {p["name"].lower(): p["version"] for p in actual_pkgs}

    # Get DB packages
    result = await session.execute(
        select(EnvPackage).where(EnvPackage.env_id == env_id)
    )
    db_pkgs = result.scalars().all()
    db_map = {p.package_name.lower(): p for p in db_pkgs}

    # Skip built-in / pip / setuptools from tracking
    skip = {"pip", "setuptools", "wheel", "pkg-resources", "pkg_resources"}

    added = updated = removed = 0

    # Packages in actual but not in DB → add
    for name_lower, version in actual_map.items():
        if name_lower in skip:
            continue
        if name_lower not in db_map:
            size_kb = await _get_package_size_kb(env_path, name_lower)
            new_pkg = EnvPackage(
                env_id=env_id,
                package_name=name_lower,
                version=version,
                size_kb=size_kb,
                installed_at=_now(),
                status="installed",
            )
            session.add(new_pkg)
            added += 1
        else:
            # Update version if changed
            existing = db_map[name_lower]
            if existing.version != version or existing.status != "installed":
                existing.version = version
                existing.status = "installed"
                if not existing.size_kb:
                    existing.size_kb = await _get_package_size_kb(env_path, name_lower)
                updated += 1

    # Packages in DB but not in actual → remove
    for name_lower, db_pkg in db_map.items():
        if name_lower not in actual_map:
            await session.delete(db_pkg)
            removed += 1

    await session.flush()

    # Reload
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
