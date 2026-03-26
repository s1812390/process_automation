import json
import os
import signal
import subprocess
import tempfile
import threading
import time
from datetime import datetime, timezone

import psutil
import redis as redis_lib
import structlog
from celery import Task
from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import sessionmaker

from celery.signals import worker_process_init

from app.celery_app import celery_app, get_queue_name
from app.config import settings

logger = structlog.get_logger()

_sync_engine = create_engine(settings.sync_database_url, pool_size=5, max_overflow=10)
_redis = redis_lib.from_url(settings.redis_url, socket_connect_timeout=2)


@event.listens_for(_sync_engine, "checkout")
def _force_utc_session(dbapi_conn, connection_record, connection_proxy):
    """Enforce UTC on every connection checkout from the pool.

    Using 'checkout' (not 'connect') ensures the UTC session is set even on
    connections that were established in the parent process before Celery
    forked worker sub-processes (the fork-safety fix).
    """
    cursor = dbapi_conn.cursor()
    cursor.execute("ALTER SESSION SET TIME_ZONE = '+00:00'")
    cursor.close()


@worker_process_init.connect
def _worker_process_init(**kwargs):
    """Discard all inherited DB connections after Celery forks a worker process.

    Without this, forked workers share the parent's connection pool objects.
    Disposing forces each worker to open fresh connections (triggering the
    'checkout' event above so UTC timezone is guaranteed).
    """
    _sync_engine.dispose()


_SyncSession = sessionmaker(bind=_sync_engine)


def get_sync_session():
    return _SyncSession()


@celery_app.task(bind=True, name="app.tasks.execute_script")
def execute_script(self: Task, script_id: int, run_id: int = None):
    from app.models import Script, ScriptRun, RunLog, AppSetting

    session = get_sync_session()
    tmp_script = None
    tmp_req = None
    tmp_params = None
    _lock_key = None  # set only when we acquire the scheduled-run distributed lock
    _proc_ref = [None]  # mutable ref so the SIGTERM handler can reach the subprocess
    _peak_ram_mb = [0]
    _cpu_samples = []
    _sampling_stop = threading.Event()
    _sampler = None

    # Install a SIGTERM handler so that `celery revoke(terminate=True)` cleanly kills
    # the child subprocess (not just the Celery worker process).  Without this the
    # subprocess becomes an orphan and keeps running after cancel.
    def _sigterm_handler(signum, frame):
        p = _proc_ref[0]
        if p is not None and p.poll() is None:
            try:
                # Kill the whole process group so any grandchildren are also killed
                os.killpg(os.getpgid(p.pid), signal.SIGTERM)
            except Exception:
                try:
                    p.terminate()
                except Exception:
                    pass
        raise SystemExit(0)

    _old_sigterm = signal.signal(signal.SIGTERM, _sigterm_handler)

    try:
        # 1. Load script from DB
        script = session.get(Script, script_id)
        if not script:
            logger.error("Script not found", script_id=script_id)
            return

        # If called from beat scheduler without a run_id, create a new run
        if run_id is None:
            # Distributed lock keyed by script only (no minute bucket).
            # This prevents duplicate execution when:
            #   - Two beat instances are running simultaneously (e.g. during deploy)
            #   - task_acks_late causes redelivery after a worker restart
            #   - Beat fires two copies into the queue before the first finishes
            # TTL is derived from the cron interval so short-interval crons (e.g.
            # every minute) still fire correctly while long-interval crons are
            # protected against firings that are several minutes apart.
            # We do NOT delete the lock after the task — we let it expire via TTL.
            dedup_ttl = 300
            if script.cron_expression:
                try:
                    from croniter import croniter as _croniter
                    _ci = _croniter(script.cron_expression)
                    _t1 = _ci.get_next(float)
                    _t2 = _ci.get_next(float)
                    interval_sec = int(_t2 - _t1)
                    dedup_ttl = max(55, min(300, interval_sec - 5))
                except Exception:
                    pass
            _lock_key = f"script_run_lock:{script_id}"
            acquired = _redis.set(_lock_key, self.request.id or "1", nx=True, ex=dedup_ttl)
            if not acquired:
                _lock_key = None  # didn't acquire — nothing to release
                logger.info(
                    "Skipping scheduled run: distributed lock already held",
                    script_id=script_id,
                    dedup_ttl=dedup_ttl,
                )
                return

            # Guard against duplicate scheduled runs (beat restart or double-delivery).
            # If this script already has a pending/running run, skip silently.
            from sqlalchemy import select as _select
            active_id = session.execute(
                _select(ScriptRun.id)
                .where(
                    ScriptRun.script_id == script_id,
                    ScriptRun.status.in_(["pending", "running"]),
                )
                .limit(1)
            ).scalar_one_or_none()
            if active_id is not None:
                logger.info(
                    "Skipping scheduled run: script already has active run",
                    script_id=script_id,
                    active_run_id=active_id,
                )
                return

            # Extract default parameters from schema (same logic as manual run)
            scheduled_params = None
            if script.parameters_schema:
                try:
                    schema = json.loads(script.parameters_schema)
                    if isinstance(schema, list):
                        defaults = {
                            p["name"]: p["default"]
                            for p in schema
                            if p.get("name") and p.get("default") not in (None, "")
                        }
                        if defaults:
                            scheduled_params = defaults
                except Exception:
                    pass

            run = ScriptRun(
                script_id=script.id,
                status="pending",
                triggered_by="scheduled",
                attempt_number=1,
                celery_task_id=self.request.id,
                parameters=json.dumps(scheduled_params) if scheduled_params else None,
            )
            session.add(run)
            session.commit()
            session.refresh(run)
            run_id = run.id
        else:
            run = session.get(ScriptRun, run_id)
            if not run:
                logger.error("Run not found", run_id=run_id)
                return

        # 2. Update run status → running
        run.status = "running"
        run.started_at = datetime.now(timezone.utc).replace(tzinfo=None)
        run.worker_pid = os.getpid()
        run.celery_task_id = self.request.id
        session.commit()

        # Load settings for defaults
        def get_setting(key: str, default=None):
            s = session.get(AppSetting, key)
            if s and s.value:
                return s.value
            return default

        effective_timeout = script.timeout_seconds or int(get_setting("default_timeout_seconds", "3600"))
        effective_cpu = script.cpu_cores or (int(get_setting("default_cpu_cores")) if get_setting("default_cpu_cores") else None)
        effective_ram = script.ram_limit_mb or (int(get_setting("default_ram_limit_mb")) if get_setting("default_ram_limit_mb") else None)

        # 3. Install requirements if any
        if script.requirements_content and script.requirements_content.strip():
            with tempfile.NamedTemporaryFile(
                mode="w", suffix=".txt", prefix=f"req_{run_id}_", delete=False
            ) as f:
                f.write(script.requirements_content)
                tmp_req = f.name

            pip_result = subprocess.run(
                ["pip", "install", "--index-url", "https://pypi.org/simple/", "-r", tmp_req],
                capture_output=True,
                text=True,
                timeout=300,
            )
            if pip_result.returncode != 0:
                log_line = RunLog(
                    run_id=run_id,
                    stream="stderr",
                    line_text=f"[pip install failed]\n{pip_result.stderr}",
                )
                session.add(log_line)
                session.commit()

        # 4. Write script to temp file
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".py", prefix=f"script_{run_id}_", delete=False
        ) as f:
            f.write(script.script_content)
            tmp_script = f.name

        # 5. Build environment: inherit + global vars + run parameters
        from app.models import GlobalVar

        child_env = os.environ.copy()

        # Inject configured timezone so datetime.now() in scripts returns local time
        tz_setting = session.get(AppSetting, "timezone")
        if tz_setting and tz_setting.value:
            child_env["TZ"] = tz_setting.value

        # Inject global variables
        global_vars = session.execute(
            __import__("sqlalchemy").select(GlobalVar)
        ).scalars().all()
        for gv in global_vars:
            child_env[gv.key] = gv.value or ""

        # Inject run parameters as PARAM_<NAME>=value
        logger.info("execute_script: run.parameters from DB", run_id=run_id, run_parameters=run.parameters)
        if run.parameters:
            try:
                params = json.loads(run.parameters)
                if isinstance(params, dict):
                    for k, v in params.items():
                        env_key = f"PARAM_{k.upper()}"
                        logger.info("execute_script: injecting env var", env_key=env_key, value=v)
                        child_env[env_key] = str(v)
                    # Also write a JSON file for convenience
                    with tempfile.NamedTemporaryFile(
                        mode="w", suffix=".json", prefix=f"params_{run_id}_", delete=False
                    ) as pf:
                        json.dump(params, pf)
                        tmp_params = pf.name  # track for cleanup in finally
                        child_env["SCHED_PARAMS_FILE"] = pf.name
            except Exception:
                pass

        # 6. Build preexec_fn for resource limits
        def preexec():
            os.setsid()  # new process group — lets us killpg the whole tree on cancel
            if effective_cpu is not None:
                try:
                    os.sched_setaffinity(0, set(range(effective_cpu)))
                except (AttributeError, OSError):
                    pass
            if effective_ram is not None:
                try:
                    import resource
                    ram_bytes = effective_ram * 1024 * 1024
                    resource.setrlimit(resource.RLIMIT_AS, (ram_bytes, ram_bytes))
                except (ImportError, OSError):
                    pass

        # 7. Start subprocess
        proc = subprocess.Popen(
            ["python", tmp_script],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            env=child_env,
            preexec_fn=preexec,
        )
        _proc_ref[0] = proc  # expose to SIGTERM handler

        # Track subprocess PID in Redis for orphan detection
        _redis.set(f"running_proc:{run_id}", proc.pid, ex=(effective_timeout + 120))

        start_time = time.time()

        # Start resource sampling thread
        def _sample_resources():
            try:
                p = psutil.Process(proc.pid)
                while not _sampling_stop.wait(2.0):
                    try:
                        mem = p.memory_info().rss // (1024 * 1024)
                        cpu = p.cpu_percent(interval=None)
                        if mem > _peak_ram_mb[0]:
                            _peak_ram_mb[0] = mem
                        if cpu > 0:
                            _cpu_samples.append(cpu)
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        break
            except Exception:
                pass

        _sampler = threading.Thread(target=_sample_resources, daemon=True)
        _sampler.start()

        # 7. Read stdout/stderr line by line with timeout
        import select as sel_module

        stdout_lines = []
        stderr_lines = []

        def read_stream(stream, stream_name, lines_list):
            for line in stream:
                line = line.rstrip("\n")
                lines_list.append((stream_name, line))
            stream.close()

        stdout_thread = threading.Thread(
            target=read_stream, args=(proc.stdout, "stdout", stdout_lines)
        )
        stderr_thread = threading.Thread(
            target=read_stream, args=(proc.stderr, "stderr", stderr_lines)
        )

        stdout_thread.start()
        stderr_thread.start()

        # Wait for process with timeout
        try:
            proc.wait(timeout=effective_timeout)
            exit_code = proc.returncode
        except subprocess.TimeoutExpired:
            proc.kill()
            stdout_thread.join(timeout=5)
            stderr_thread.join(timeout=5)
            _sampling_stop.set()
            _sampler.join(timeout=3)
            elapsed_ms = int((time.time() - start_time) * 1000)
            run.status = "timeout"
            run.finished_at = datetime.now(timezone.utc).replace(tzinfo=None)
            run.duration_ms = elapsed_ms
            if _peak_ram_mb[0] > 0:
                run.peak_ram_mb = _peak_ram_mb[0]
            if _cpu_samples:
                run.avg_cpu_percent = int(sum(_cpu_samples) / len(_cpu_samples))
            session.commit()

            _flush_logs(session, run_id, stdout_lines + stderr_lines)
            _handle_retry_or_alert(session, script, run, "timeout")
            return

        stdout_thread.join(timeout=10)
        stderr_thread.join(timeout=10)
        _sampling_stop.set()
        _sampler.join(timeout=3)

        elapsed_ms = int((time.time() - start_time) * 1000)

        # 8. Flush all collected logs
        _flush_logs(session, run_id, stdout_lines + stderr_lines)

        # 9. Update status
        final_status = "success" if exit_code == 0 else "failed"
        run.status = final_status
        run.finished_at = datetime.now(timezone.utc).replace(tzinfo=None)
        run.duration_ms = elapsed_ms
        if _peak_ram_mb[0] > 0:
            run.peak_ram_mb = _peak_ram_mb[0]
        if _cpu_samples:
            run.avg_cpu_percent = int(sum(_cpu_samples) / len(_cpu_samples))
        session.commit()

        # 11-12. Handle retry/alert
        _handle_retry_or_alert(session, script, run, final_status)

    except Exception as e:
        logger.error("Task execution error", error=str(e), run_id=run_id)
        try:
            run = session.get(ScriptRun, run_id)
            if run:
                run.status = "failed"
                run.finished_at = datetime.now(timezone.utc).replace(tzinfo=None)
                session.commit()
        except Exception:
            pass
    finally:
        # Stop resource sampler if still running
        try:
            _sampling_stop.set()
            if _sampler is not None:
                _sampler.join(timeout=3)
        except Exception:
            pass
        # Remove Redis proc tracking key
        try:
            _redis.delete(f"running_proc:{run_id}")
        except Exception:
            pass
        # Restore the original SIGTERM handler before we exit
        try:
            signal.signal(signal.SIGTERM, _old_sigterm)
        except Exception:
            pass
        session.close()
        # Note: we intentionally do NOT delete _lock_key here.
        # The lock expires via TTL (dedup_ttl) to block any duplicate tasks
        # that a second beat instance may fire within the dedup window.
        if tmp_script and os.path.exists(tmp_script):
            os.unlink(tmp_script)
        if tmp_req and os.path.exists(tmp_req):
            os.unlink(tmp_req)
        if tmp_params and os.path.exists(tmp_params):
            os.unlink(tmp_params)


def _flush_logs(session, run_id: int, lines: list):
    from app.models import RunLog
    for stream, line_text in lines:
        log = RunLog(run_id=run_id, stream=stream, line_text=line_text)
        session.add(log)
    session.commit()


def _handle_retry_or_alert(session, script, run, status: str):
    from app.models import ScriptRun

    max_retries = script.max_retries or 0
    if status != "success" and run.attempt_number < max_retries:
        # Create new run for retry
        new_run = ScriptRun(
            script_id=script.id,
            status="pending",
            triggered_by=run.triggered_by,
            attempt_number=run.attempt_number + 1,
        )
        session.add(new_run)
        session.commit()

        execute_script.apply_async(
            args=[script.id, new_run.id],
            countdown=60,
            queue=get_queue_name(script.priority),
        )
    else:
        # Send alert
        _send_alert(session, script, run, status)


def _send_alert(session, script, run, status: str):
    from app.models import AlertConfig, AppSetting
    from app.services.alerts import send_alert

    # Per-script alerts
    alerts = session.execute(
        __import__("sqlalchemy").select(AlertConfig).where(AlertConfig.script_id == script.id)
    ).scalars().all()

    for alert in alerts:
        should_send = (
            (status == "failed" and alert.on_failure)
            or (status == "success" and alert.on_success)
            or (status == "timeout" and alert.on_timeout)
        )
        if should_send:
            try:
                send_alert(
                    channel=alert.channel,
                    destination=alert.destination,
                    script_name=script.name,
                    run_id=run.id,
                    status=status,
                    tag=script.tag,
                )
            except Exception as e:
                logger.error("Alert send failed", error=str(e))

    # Global admin alerts
    def _get_setting(key):
        s = session.get(AppSetting, key)
        return s.value if s and s.value else None

    global_channel = _get_setting("global_alert_channel")
    global_dest = _get_setting("global_alert_destination")
    global_on_failure = (_get_setting("global_alert_on_failure") or "").lower() == "true"
    global_on_timeout = (_get_setting("global_alert_on_timeout") or "").lower() == "true"

    if global_channel and global_dest:
        should_send_global = (
            (status == "failed" and global_on_failure)
            or (status == "timeout" and global_on_timeout)
        )
        if should_send_global:
            try:
                send_alert(
                    channel=global_channel,
                    destination=global_dest,
                    script_name=script.name,
                    run_id=run.id,
                    status=status,
                    tag=script.tag,
                )
            except Exception as e:
                logger.error("Global alert send failed", error=str(e))
