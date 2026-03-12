from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class Script(Base):
    __tablename__ = "scripts"

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    script_content = Column(Text, nullable=False)
    requirements_content = Column(Text)
    cron_expression = Column(String(100))
    timeout_seconds = Column(Integer)
    priority = Column(Integer, default=3)
    max_retries = Column(Integer, default=0)
    cpu_cores = Column(Integer)
    ram_limit_mb = Column(Integer)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.current_timestamp())
    updated_at = Column(DateTime, server_default=func.current_timestamp(), onupdate=func.current_timestamp())

    runs = relationship("ScriptRun", back_populates="script", cascade="all, delete-orphan")
    alert_configs = relationship("AlertConfig", back_populates="script", cascade="all, delete-orphan")
