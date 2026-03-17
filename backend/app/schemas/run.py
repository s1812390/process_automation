from pydantic import BaseModel, field_serializer
from typing import Optional, List
from datetime import datetime, timezone


def _utc(dt: Optional[datetime]) -> Optional[str]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.isoformat() + "Z"
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


class RunResponse(BaseModel):
    id: int
    script_id: int
    script_name: Optional[str] = None
    status: str
    triggered_by: str
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    duration_ms: Optional[int] = None
    attempt_number: int
    celery_task_id: Optional[str] = None
    worker_pid: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True

    @field_serializer("created_at", "started_at", "finished_at")
    def serialize_dt(self, v: Optional[datetime]) -> Optional[str]:
        return _utc(v)


class RunListResponse(BaseModel):
    items: List[RunResponse]
    total: int
    page: int
    page_size: int


class LogLineResponse(BaseModel):
    id: int
    run_id: int
    logged_at: datetime
    stream: str
    line_text: str

    class Config:
        from_attributes = True

    @field_serializer("logged_at")
    def serialize_dt(self, v: Optional[datetime]) -> Optional[str]:
        return _utc(v)
