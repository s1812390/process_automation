"""
Dynamic beat schedule that reads active scripts with cron_expression from Oracle DB.
"""
import time
from datetime import datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from celery.beat import PersistentScheduler, ScheduleEntry
from celery.schedules import crontab
import structlog

logger = structlog.get_logger()

# Module-level callable so it can be pickled by shelve
class _TzNow:
    """Picklable nowfun for timezone-aware crontab."""
    def __init__(self, tz_name: str):
        self.tz_name = tz_name

    def __call__(self):
        from zoneinfo import ZoneInfo
        from datetime import datetime
        return datetime.now(ZoneInfo(self.tz_name))


def _make_beat_engine():
    """Create a reusable sync engine with UTC session for the beat process."""
    from sqlalchemy import create_engine, event
    from sqlalchemy.orm import sessionmaker
    from app.config import settings

    engine = create_engine(settings.sync_database_url, pool_size=2, max_overflow=2)

    @event.listens_for(engine, "connect")
    def _force_utc(dbapi_conn, _):
        cursor = dbapi_conn.cursor()
        cursor.execute("ALTER SESSION SET TIME_ZONE = '+00:00'")
        cursor.close()

    return engine, sessionmaker(bind=engine)


class DatabaseScheduler(PersistentScheduler):
    """Custom Celery Beat scheduler that reads cron jobs from Oracle DB."""

    UPDATE_INTERVAL = 60  # seconds between DB reads

    def __init__(self, *args, **kwargs):
        self._db_last_update = 0
        self._beat_engine = None
        self._BeatSession = None
        super().__init__(*args, **kwargs)

    def _get_session(self):
        if self._beat_engine is None:
            self._beat_engine, self._BeatSession = _make_beat_engine()
        return self._BeatSession()

    def setup_schedule(self):
        super().setup_schedule()  # opens shelve (_store) + installs default entries
        self._update_from_db()
        self._db_last_update = time.monotonic()

    def tick(self, *args, **kwargs):
        now = time.monotonic()
        if now - self._db_last_update > self.UPDATE_INTERVAL:
            self._update_from_db()
            self._db_last_update = now
        return super().tick(*args, **kwargs)

    def _get_timezone(self, session) -> ZoneInfo:
        """Read timezone from app settings, default to UTC."""
        try:
            from app.models import AppSetting
            setting = session.get(AppSetting, "timezone")
            tz_name = setting.value if setting and setting.value else "UTC"
            return ZoneInfo(tz_name)
        except (ZoneInfoNotFoundError, Exception):
            return ZoneInfo("UTC")

    def _update_from_db(self):
        try:
            from sqlalchemy import select
            from app.models import Script

            session = self._get_session()
            try:
                tz = self._get_timezone(session)

                scripts = session.execute(
                    select(Script).where(
                        Script.is_active == True,
                        Script.cron_expression != None,
                    )
                ).scalars().all()

                new_task_names = set()
                for script in scripts:
                    try:
                        sched = self._parse_cron(script.cron_expression, tz)
                        task_name = f"script-{script.id}"
                        new_task_names.add(task_name)

                        existing = self.schedule.get(task_name)

                        # Only add/update if the entry is new or schedule changed
                        if existing is None:
                            # New script — set last_run_at far in the past so it fires immediately
                            self.schedule[task_name] = ScheduleEntry(
                                name=task_name,
                                task="app.tasks.execute_script",
                                schedule=sched,
                                args=(script.id,),
                                kwargs={},
                                options={"queue": _get_queue(script.priority)},
                                app=self.app,
                                last_run_at=datetime(2000, 1, 1, tzinfo=timezone.utc),
                                total_run_count=0,
                            )
                        elif _schedule_changed(existing.schedule, sched):
                            # Cron expression changed — update schedule but keep last_run_at
                            self.schedule[task_name] = ScheduleEntry(
                                name=task_name,
                                task="app.tasks.execute_script",
                                schedule=sched,
                                args=(script.id,),
                                kwargs={},
                                options={"queue": _get_queue(script.priority)},
                                app=self.app,
                                last_run_at=existing.last_run_at,
                                total_run_count=existing.total_run_count,
                            )
                        # else: entry unchanged — leave it alone so Celery Beat state is preserved

                    except Exception as e:
                        logger.warning("Invalid cron expression", script_id=script.id, error=str(e))

                # Remove stale entries (scripts deleted or deactivated)
                to_remove = [k for k in list(self.schedule.keys()) if k.startswith("script-") and k not in new_task_names]
                for k in to_remove:
                    del self.schedule[k]

                self.sync()
                logger.info("Beat schedule updated", count=len(new_task_names), timezone=str(tz))
            finally:
                session.close()

        except Exception as e:
            logger.error("Failed to update beat schedule from DB", error=str(e))

    def _parse_cron(self, expr: str, tz: ZoneInfo = None) -> crontab:
        # Normalize: collapse whitespace
        normalized = ' '.join(expr.strip().split())
        parts = normalized.split()
        if len(parts) == 5:
            minute, hour, day, month, day_of_week = parts
            kwargs = dict(
                minute=minute,
                hour=hour,
                day_of_month=day,
                month_of_year=month,
                day_of_week=day_of_week,
            )
            if tz is not None:
                kwargs['nowfun'] = _TzNow(str(tz))
            return crontab(**kwargs)
        raise ValueError(f"Invalid cron expression: {expr!r} (must be 5 space-separated fields, e.g. '* * * * *')")


def _schedule_changed(old: crontab, new: crontab) -> bool:
    """Return True if cron expression or timezone changed."""
    return (
        old.minute != new.minute
        or old.hour != new.hour
        or old.day_of_month != new.day_of_month
        or old.month_of_year != new.month_of_year
        or old.day_of_week != new.day_of_week
    )


def _get_queue(priority: int) -> str:
    from app.celery_app import get_queue_name
    return get_queue_name(priority)
