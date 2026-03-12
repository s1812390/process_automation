from sqlalchemy import Column, Integer, String, Text, DateTime
from sqlalchemy.sql import func
from app.database import Base


class GlobalVar(Base):
    __tablename__ = "SH_GLOBAL_VARS"

    id = Column(Integer, primary_key=True)
    key = Column(String(200), nullable=False, unique=True)
    value = Column(Text, nullable=False)
    description = Column(String(500))
    created_at = Column(DateTime, server_default=func.current_timestamp())
    updated_at = Column(DateTime, server_default=func.current_timestamp(), onupdate=func.current_timestamp())
