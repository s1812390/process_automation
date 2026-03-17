from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base


class RunLog(Base):
    __tablename__ = "SH_RUN_LOGS"

    id = Column(Integer, primary_key=True)
    run_id = Column(Integer, ForeignKey("SH_SCRIPT_RUNS.id"), nullable=False)
    logged_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    stream = Column(String(6), nullable=False)
    line_text = Column(Text, nullable=False)

    run = relationship("ScriptRun", back_populates="logs")
