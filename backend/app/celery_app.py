from celery import Celery
from app.config import settings

celery_app = Celery(
    "scheduler",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
)

celery_app.conf.task_queues = {
    "high": {"exchange": "high", "routing_key": "high"},
    "normal": {"exchange": "normal", "routing_key": "normal"},
    "default": {"exchange": "default", "routing_key": "default"},
}

celery_app.conf.task_default_queue = "default"
celery_app.conf.task_default_exchange = "default"
celery_app.conf.task_default_routing_key = "default"


def get_queue_name(priority: int) -> str:
    if priority >= 4:
        return "high"
    elif priority >= 2:
        return "normal"
    return "default"
