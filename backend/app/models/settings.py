from sqlalchemy import Column, String, DateTime
from sqlalchemy.sql import func
from app.database import Base


class AppSetting(Base):
    __tablename__ = "SH_APP_SETTINGS"

    key = Column(String(100), primary_key=True)
    value = Column(String(4000), nullable=True)
    updated_at = Column(DateTime, server_default=func.current_timestamp(), onupdate=func.current_timestamp())
