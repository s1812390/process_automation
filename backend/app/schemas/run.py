from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


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
