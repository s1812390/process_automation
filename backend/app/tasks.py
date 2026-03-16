import json
import os
import signal
import subprocess
import tempfile
import time
from datetime import datetime, timezone

import structlog
from celery import Task
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.celery_app import celery_app, get_queue_name
from app.config import settings

logger = structlog.get_logger()


def get_sync_session():
    engine = create_engine(settings.sync_database_url)
    Session = sessionmaker(bind=engine)
    return Session()


@celery_app.task(bind=True, name="app.tasks.execute_script")
def execute_script(self: Task, script_id: int, run_id: int = None):
    from app.models import Script, ScriptRun, RunLog, AppSetting

    session = get_sync_session()
    tmp_script = None
    tmp_req = None

    try:
        # 1. Load script from DB
        script = session.get(Script, script_id)
        if not script:
            logger.error("Script not found", script_id=script_id)
            return

        # If called from beat scheduler without a run_id, create a new run
        if run_id is None:
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
        run.started_at = datetime.now(timezone.utc)
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
        if run.parameters:
            try:
                params = json.loads(run.parameters)
                if isinstance(params, dict):
                    for k, v in params.items():
                        child_env[f"PARAM_{k.upper()}"] = str(v)
                    # Also write a JSON file for convenience
                    with tempfile.NamedTemporaryFile(
                        mode="w", suffix=".json", prefix=f"params_{run_id}_", delete=False
                    ) as pf:
                        json.dump(params, pf)
                        child_env["SCHED_PARAMS_FILE"] = pf.name
            except Exception:
                pass

        # 6. Build preexec_fn for resource limits
        def preexec():
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

        start_time = time.time()

        # 7. Read stdout/stderr line by line with timeout
        import select as sel_module
        import threading

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
            elapsed_ms = int((time.time() - start_time) * 1000)
            run.status = "timeout"
            run.finished_at = datetime.now(timezone.utc)
            run.duration_ms = elapsed_ms
            session.commit()

            _flush_logs(session, run_id, stdout_lines + stderr_lines)
            _handle_retry_or_alert(session, script, run, "timeout")
            return

        stdout_thread.join(timeout=10)
        stderr_thread.join(timeout=10)

        elapsed_ms = int((time.time() - start_time) * 1000)

        # 8. Flush all collected logs
        all_lines = sorted(
            [(s, l) for s, l in stdout_lines] + [(s, l) for s, l in stderr_lines]
        )
        _flush_logs(session, run_id, stdout_lines + stderr_lines)

        # 9. Update status
        final_status = "success" if exit_code == 0 else "failed"
        run.status = final_status
        run.finished_at = datetime.now(timezone.utc)
        run.duration_ms = elapsed_ms
        session.commit()

        # 11-12. Handle retry/alert
        _handle_retry_or_alert(session, script, run, final_status)

    except Exception as e:
        logger.error("Task execution error", error=str(e), run_id=run_id)
        try:
            run = session.get(ScriptRun, run_id)
            if run:
                run.status = "failed"
                run.finished_at = datetime.now(timezone.utc)
                session.commit()
        except Exception:
            pass
    finally:
        session.close()
        if tmp_script and os.path.exists(tmp_script):
            os.unlink(tmp_script)
        if tmp_req and os.path.exists(tmp_req):
            os.unlink(tmp_req)


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
