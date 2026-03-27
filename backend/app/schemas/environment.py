from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, timezone


def _utc(dt: Optional[datetime]) -> Optional[str]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.isoformat() + "Z"
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


class EnvPackageResponse(BaseModel):
    id: int
    env_id: int
    package_name: str
    version: Optional[str] = None
    size_kb: Optional[int] = None
    installed_at: Optional[datetime] = None
    status: Optional[str] = None

    class Config:
        from_attributes = True

    def model_post_init(self, __context):
        pass

    @classmethod
    def from_orm_utc(cls, obj) -> "EnvPackageResponse":
        r = cls.model_validate(obj)
        return r

    def model_dump(self, **kwargs):
        d = super().model_dump(**kwargs)
        if d.get("installed_at") is not None:
            d["installed_at"] = _utc(self.installed_at)
        return d


class PythonEnvCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)


class PythonEnvResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    python_version: Optional[str] = None
    path: Optional[str] = None
    package_count: int = 0
    total_size_kb: int = 0
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

    def model_dump(self, **kwargs):
        d = super().model_dump(**kwargs)
        if d.get("created_at") is not None:
            d["created_at"] = _utc(self.created_at)
        if d.get("updated_at") is not None:
            d["updated_at"] = _utc(self.updated_at)
        return d


class InstallPackageRequest(BaseModel):
    package_name: str = Field(..., min_length=1, max_length=200)
    version: Optional[str] = Field(None, max_length=50)


class SyncResult(BaseModel):
    added: int
    removed: int
    updated: int
    packages: List[EnvPackageResponse]
