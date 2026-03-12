from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class RunLog(Base):
    __tablename__ = "run_logs"

    id = Column(Integer, primary_key=True)
    run_id = Column(Integer, ForeignKey("script_runs.id"), nullable=False)
    logged_at = Column(DateTime, server_default=func.current_timestamp())
    stream = Column(String(6), nullable=False)
    line_text = Column(Text, nullable=False)

    run = relationship("ScriptRun", back_populates="logs")
