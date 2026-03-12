from sqlalchemy import Column, Integer, String, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base


class AlertConfig(Base):
    __tablename__ = "SH_ALERT_CONFIGS"

    id = Column(Integer, primary_key=True)
    script_id = Column(Integer, ForeignKey("SH_SCRIPTS.id", ondelete="CASCADE"), nullable=False)
    on_failure = Column(Boolean, default=True)
    on_success = Column(Boolean, default=False)
    on_timeout = Column(Boolean, default=True)
    channel = Column(String(20), nullable=False)
    destination = Column(String(500), nullable=False)

    script = relationship("Script", back_populates="alert_configs")
