from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Sequence
from sqlalchemy.orm import relationship
from app.database import Base


class PythonEnv(Base):
    __tablename__ = "SH_PYTHON_ENVS"

    id = Column(Integer, Sequence('sh_python_envs_seq', start=1), primary_key=True)
    name = Column(String(100), nullable=False, unique=True)
    description = Column(String(500))
    python_version = Column(String(30))
    path = Column(String(500))
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
                        onupdate=lambda: datetime.now(timezone.utc).replace(tzinfo=None))

    packages = relationship("EnvPackage", back_populates="env", cascade="all, delete-orphan",
                            lazy="select")
    scripts = relationship("Script", back_populates="python_env", lazy="select")


class EnvPackage(Base):
    __tablename__ = "SH_ENV_PACKAGES"

    id = Column(Integer, Sequence('sh_env_packages_seq', start=1), primary_key=True)
    env_id = Column(Integer, ForeignKey("SH_PYTHON_ENVS.id", ondelete="CASCADE"), nullable=False)
    package_name = Column(String(200), nullable=False)
    version = Column(String(50))
    size_kb = Column(Integer)
    installed_at = Column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    status = Column(String(20), default="installing")  # installing / installed / failed

    env = relationship("PythonEnv", back_populates="packages")
