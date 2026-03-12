"""
Dynamic beat schedule that reads active scripts with cron_expression from Oracle DB.
"""
import asyncio
from celery.beat import PersistentScheduler
from celery.schedules import crontab
import structlog

logger = structlog.get_logger()


class DatabaseScheduler(PersistentScheduler):
    """Custom Celery Beat scheduler that reads cron jobs from Oracle DB."""

    UPDATE_INTERVAL = 60  # seconds between DB reads

    def __init__(self, *args, **kwargs):
        self._db_last_update = 0
        super().__init__(*args, **kwargs)

    def setup_schedule(self):
        self.install_default_entries(self.data)
        self._update_from_db()

    def tick(self, *args, **kwargs):
        import time
        now = time.monotonic()
        if now - self._db_last_update > self.UPDATE_INTERVAL:
            self._update_from_db()
            self._db_last_update = now
        return super().tick(*args, **kwargs)

    def _update_from_db(self):
        try:
            from sqlalchemy import create_engine, select
            from sqlalchemy.orm import sessionmaker
            from app.config import settings
            from app.models import Script

            engine = create_engine(settings.sync_database_url)
            Session = sessionmaker(bind=engine)
            session = Session()

            try:
                scripts = session.execute(
                    select(Script).where(
                        Script.is_active == True,
                        Script.cron_expression != None,
                    )
                ).scalars().all()

                new_entries = {}
                for script in scripts:
                    try:
                        schedule = self._parse_cron(script.cron_expression)
                        task_name = f"script-{script.id}"
                        new_entries[task_name] = {
                            "task": "app.tasks.execute_script",
                            "schedule": schedule,
                            "args": [script.id],
                            "kwargs": {},
                            "options": {"queue": _get_queue(script.priority)},
                        }
                    except Exception as e:
                        logger.warning("Invalid cron expression", script_id=script.id, error=str(e))

                # Remove old script entries
                to_remove = [k for k in self.data.keys() if k.startswith("script-")]
                for k in to_remove:
                    del self.data[k]

                # Add updated entries
                for name, entry_data in new_entries.items():
                    self.update_entry(name, entry_data)

                logger.info("Beat schedule updated", count=len(new_entries))
            finally:
                session.close()
                engine.dispose()

        except Exception as e:
            logger.error("Failed to update beat schedule from DB", error=str(e))

    def _parse_cron(self, expr: str) -> crontab:
        parts = expr.strip().split()
        if len(parts) == 5:
            minute, hour, day, month, day_of_week = parts
            return crontab(
                minute=minute,
                hour=hour,
                day_of_month=day,
                month_of_year=month,
                day_of_week=day_of_week,
            )
        raise ValueError(f"Invalid cron expression: {expr}")


def _get_queue(priority: int) -> str:
    from app.celery_app import get_queue_name
    return get_queue_name(priority)
