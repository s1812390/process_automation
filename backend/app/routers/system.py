import os
import shutil
from datetime import datetime, timezone, timedelta
from typing import List, Optional

import psutil
import redis as redis_lib
import structlog
from fastapi import APIRouter
from sqlalchemy import select, create_engine, event
from sqlalchemy.orm import sessionmaker

from app.config import settings

logger = structlog.get_logger()

router = APIRouter(prefix="/api/system", tags=["system"])

_sync_engine = create_engine(settings.sync_database_url, pool_size=2, max_overflow=5)


@event.listens_for(_sync_engine, "checkout")
def _force_utc(dbapi_conn, connection_record, connection_proxy):
    cursor = dbapi_conn.cursor()
    cursor.execute("ALTER SESSION SET TIME_ZONE = '+00:00'")
    cursor.close()


_SyncSession = sessionmaker(bind=_sync_engine)


def _get_redis():
    return redis_lib.from_url(settings.redis_url, socket_connect_timeout=2)


def _get_host_metrics() -> dict:
    cpu = psutil.cpu_percent(interval=0.5)
    vm = psutil.virtual_memory()
    load = psutil.getloadavg()
    return {
        "cpu_percent": cpu,
        "ram_total_mb": round(vm.total / (1024 * 1024), 1),
        "ram_used_mb": round(vm.used / (1024 * 1024), 1),
        "ram_free_mb": round(vm.available / (1024 * 1024), 1),
        "ram_percent": vm.percent,
        "load_avg_1m": round(load[0], 2),
        "load_avg_5m": round(load[1], 2),
        "load_avg_15m": round(load[2], 2),
    }


def _get_container_metrics(project_name: str) -> Optional[List[dict]]:
    try:
        import docker
        client = docker.from_env()
        containers = client.containers.list(
            filters={"label": f"com.docker.compose.project={project_name}"}
        )
        result = []
        for container in containers:
            try:
                stats = container.stats(stream=False)
                cpu_percent = 0.0
                try:
                    cpu_delta = (
                        stats["cpu_stats"]["cpu_usage"]["total_usage"]
                        - stats["precpu_stats"]["cpu_usage"]["total_usage"]
                    )
                    system_delta = (
                        stats["cpu_stats"]["system_cpu_usage"]
                        - stats["precpu_stats"]["system_cpu_usage"]
                    )
                    num_cpus = stats["cpu_stats"].get("online_cpus", 1)
                    if system_delta > 0:
                        cpu_percent = round((cpu_delta / system_delta) * num_cpus * 100.0, 2)
                except (KeyError, ZeroDivisionError):
                    pass

                mem_used_mb = 0.0
                mem_limit_mb = 0.0
                try:
                    mem_stats = stats.get("memory_stats", {})
                    mem_used_mb = round(mem_stats.get("usage", 0) / (1024 * 1024), 1)
                    mem_limit_mb = round(mem_stats.get("limit", 0) / (1024 * 1024), 1)
                except Exception:
                    pass

                # Clean up container name: remove leading slash and project prefix
                name = container.name
                if name.startswith("/"):
                    name = name[1:]
                prefix = f"{project_name}_"
                if name.startswith(prefix):
                    name = name[len(prefix):]
                # Also handle project-service-N format
                parts = name.split("_")
                if len(parts) >= 2 and parts[0] == project_name:
                    name = "_".join(parts[1:])

                result.append({
                    "name": name,
                    "status": container.status,
                    "cpu_percent": cpu_percent,
                    "mem_used_mb": mem_used_mb,
                    "mem_limit_mb": mem_limit_mb,
                })
            except Exception as e:
                logger.warning("Failed to get stats for container", container=container.name, error=str(e))
                continue
        return result
    except Exception as e:
        logger.warning("Docker SDK unavailable", error=str(e))
        return None


def _get_log_file_sizes(project_name: str) -> Optional[List[dict]]:
    try:
        import docker
        client = docker.from_env()
        containers = client.containers.list(
            filters={"label": f"com.docker.compose.project={project_name}"}
        )
        result = []
        for container in containers:
            try:
                info = client.api.inspect_container(container.id)
                log_path = info.get("LogPath", "")
                size_mb = None
                if log_path:
                    try:
                        size_mb = round(os.path.getsize(log_path) / (1024 * 1024), 2)
                    except (OSError, PermissionError):
                        pass

                name = container.name
                if name.startswith("/"):
                    name = name[1:]
                prefix = f"{project_name}_"
                if name.startswith(prefix):
                    name = name[len(prefix):]

                result.append({"name": name, "size_mb": size_mb})
            except Exception:
                continue
        return result
    except Exception:
        return None


def _get_disk_metrics() -> dict:
    result = {}
    try:
        tmp = shutil.disk_usage("/tmp")
        result["tmp"] = {
            "used_mb": round(tmp.used / (1024 * 1024), 1),
            "total_mb": round(tmp.total / (1024 * 1024), 1),
        }
    except Exception:
        result["tmp"] = None

    try:
        data = shutil.disk_usage("/data")
        result["data"] = {
            "used_mb": round(data.used / (1024 * 1024), 1),
            "total_mb": round(data.total / (1024 * 1024), 1),
        }
    except Exception:
        result["data"] = None

    return result


def _get_runs_stats(redis_client) -> dict:
    from app.models import ScriptRun, Script

    session = _SyncSession()
    try:
        # Get all active runs
        active_runs = session.execute(
            select(ScriptRun).where(ScriptRun.status.in_(["running", "pending"]))
        ).scalars().all()

        active_count = len(active_runs)
        potential_orphans = []
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        orphan_threshold = timedelta(minutes=5)

        for run in active_runs:
            if run.status != "running":
                continue
            if run.started_at is None:
                continue
            elapsed = now - run.started_at
            if elapsed < orphan_threshold:
                continue
            # Check if Redis key exists
            key_exists = redis_client.exists(f"running_proc:{run.id}")
            if key_exists:
                continue
            # Potential orphan
            script = session.get(Script, run.script_id)
            script_name = script.name if script else f"script_{run.script_id}"
            duration_sec = int(elapsed.total_seconds())
            potential_orphans.append({
                "run_id": run.id,
                "script_name": script_name,
                "started_at": run.started_at.isoformat() + "Z",
                "duration_sec": duration_sec,
            })

        return {
            "active": active_count,
            "potential_orphans": potential_orphans,
        }
    finally:
        session.close()


@router.get("/stats")
async def get_system_stats():
    project_name = os.environ.get("COMPOSE_PROJECT_NAME", "process_automation")

    host = _get_host_metrics()
    containers = _get_container_metrics(project_name)
    disk = _get_disk_metrics()
    log_files = _get_log_file_sizes(project_name)

    try:
        redis_client = _get_redis()
        runs = _get_runs_stats(redis_client)
    except Exception as e:
        logger.warning("Failed to get runs stats", error=str(e))
        runs = {"active": 0, "potential_orphans": []}

    return {
        "host": host,
        "containers": containers,
        "disk": disk,
        "log_files": log_files,
        "runs": runs,
    }
