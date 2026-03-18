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

# Redis key that the API sets to trigger an immediate schedule reload
FORCE_RELOAD_KEY = "beat:force_reload"


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
        self._last_tz_name = None
        self._redis = None
        super().__init__(*args, **kwargs)

    def _get_session(self):
        if self._beat_engine is None:
            self._beat_engine, self._BeatSession = _make_beat_engine()
        return self._BeatSession()

    def _get_redis(self):
        """Lazy-init a redis client for the force-reload signal."""
        if self._redis is None:
            try:
                import redis as redis_lib
                from app.config import settings
                self._redis = redis_lib.from_url(settings.redis_url, socket_connect_timeout=2)
            except Exception as e:
                logger.warning("Beat: could not connect to Redis for force-reload", error=str(e))
        return self._redis

    def setup_schedule(self):
        super().setup_schedule()  # opens shelve (_store) + installs default entries
        self._update_from_db()
        self._db_last_update = time.monotonic()

    def tick(self, *args, **kwargs):
        now = time.monotonic()
        force_reload = False

        # Check Redis flag set by the API when scripts are created/toggled
        try:
            r = self._get_redis()
            if r and r.getdel(FORCE_RELOAD_KEY):
                force_reload = True
        except Exception:
            pass

        if force_reload or now - self._db_last_update > self.UPDATE_INTERVAL:
            self._update_from_db()
            self._db_last_update = now

        return super().tick(*args, **kwargs)

    def _get_timezone_name(self, session) -> str:
        """Read timezone name from app settings, default to UTC."""
        try:
            from app.models import AppSetting
            setting = session.get(AppSetting, "timezone")
            tz_name = setting.value if setting and setting.value else "UTC"
            # Validate the timezone name
            ZoneInfo(tz_name)
            return tz_name
        except (ZoneInfoNotFoundError, Exception):
            return "UTC"

    def _update_from_db(self):
        try:
            from sqlalchemy import select
            from app.models import Script

            session = self._get_session()
            try:
                tz_name = self._get_timezone_name(session)

                # If timezone changed, update app config and force-recreate all
                # crontab entries so they pick up the new timezone.
                tz_changed = (tz_name != self._last_tz_name)
                if tz_changed:
                    self.app.conf.timezone = tz_name
                    self._last_tz_name = tz_name
                    logger.info("Beat timezone updated", timezone=tz_name)

                scripts = session.execute(
                    select(Script).where(
                        Script.is_active == True,
                        Script.cron_expression != None,
                    )
                ).scalars().all()

                new_task_names = set()
                for script in scripts:
                    try:
                        sched = self._parse_cron(script.cron_expression)
                        task_name = f"script-{script.id}"
                        new_task_names.add(task_name)

                        existing = self.schedule.get(task_name)

                        if existing is None:
                            # New script — set last_run_at far in the past so it
                            # fires on the next matching cron minute, not immediately
                            # (Celery will compute remaining_delta normally)
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
                        elif tz_changed or _schedule_changed(existing.schedule, sched):
                            # Cron expression or timezone changed — recreate entry
                            # but preserve last_run_at so we don't double-fire
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
                        # else: entry unchanged — leave it alone so Celery Beat
                        # state (last_run_at, total_run_count) is preserved

                    except Exception as e:
                        logger.warning("Invalid cron expression", script_id=script.id, error=str(e))

                # Remove stale entries (scripts deleted or deactivated)
                to_remove = [
                    k for k in list(self.schedule.keys())
                    if k.startswith("script-") and k not in new_task_names
                ]
                for k in to_remove:
                    del self.schedule[k]

                self.sync()
                logger.info(
                    "Beat schedule updated",
                    count=len(new_task_names),
                    timezone=tz_name,
                )
            finally:
                session.close()

        except Exception as e:
            logger.error("Failed to update beat schedule from DB", error=str(e))

    def _parse_cron(self, expr: str) -> crontab:
        """Parse a 5-field cron expression into a Celery crontab.

        The crontab is created with ``app=self.app`` so that it inherits the
        app's ``conf.timezone`` (updated to the DB value in ``_update_from_db``).
        This ensures the cron fires in the configured local timezone rather than
        always in UTC.
        """
        normalized = ' '.join(expr.strip().split())
        parts = normalized.split()
        if len(parts) == 5:
            minute, hour, day, month, day_of_week = parts
            return crontab(
                minute=minute,
                hour=hour,
                day_of_month=day,
                month_of_year=month,
                day_of_week=day_of_week,
                app=self.app,
            )
        raise ValueError(
            f"Invalid cron expression: {expr!r} "
            "(must be 5 space-separated fields, e.g. '* * * * *')"
        )


def _schedule_changed(old: crontab, new: crontab) -> bool:
    """Return True if the cron expression fields changed."""
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
