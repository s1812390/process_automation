from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class ScriptRun(Base):
    __tablename__ = "SH_SCRIPT_RUNS"

    id = Column(Integer, primary_key=True)
    script_id = Column(Integer, ForeignKey("SH_SCRIPTS.id"), nullable=False)
    status = Column(String(20), default="pending")
    triggered_by = Column(String(10), default="manual")
    started_at = Column(DateTime)
    finished_at = Column(DateTime)
    duration_ms = Column(Integer)
    attempt_number = Column(Integer, default=1)
    celery_task_id = Column(String(255))
    worker_pid = Column(Integer)
    parameters = Column(Text)
    created_at = Column(DateTime, server_default=func.current_timestamp())

    script = relationship("Script", back_populates="runs")
    logs = relationship("RunLog", back_populates="run", cascade="all, delete-orphan")
