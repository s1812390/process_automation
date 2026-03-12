from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class ScriptBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    script_content: str = Field(..., min_length=1)
    requirements_content: Optional[str] = None
    cron_expression: Optional[str] = None
    timeout_seconds: Optional[int] = Field(None, gt=0)
    priority: int = Field(3, ge=1, le=5)
    max_retries: int = Field(0, ge=0)
    cpu_cores: Optional[int] = Field(None, gt=0)
    ram_limit_mb: Optional[int] = Field(None, gt=0)
    is_active: bool = True
    parameters_schema: Optional[str] = None


class ScriptCreate(ScriptBase):
    pass


class ScriptUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    script_content: Optional[str] = None
    requirements_content: Optional[str] = None
    cron_expression: Optional[str] = None
    timeout_seconds: Optional[int] = Field(None, gt=0)
    priority: Optional[int] = Field(None, ge=1, le=5)
    max_retries: Optional[int] = Field(None, ge=0)
    cpu_cores: Optional[int] = Field(None, gt=0)
    ram_limit_mb: Optional[int] = Field(None, gt=0)
    is_active: Optional[bool] = None
    parameters_schema: Optional[str] = None


class ScriptResponse(ScriptBase):
    id: int
    webhook_token: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    last_run_status: Optional[str] = None
    last_run_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ScriptListResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    cron_expression: Optional[str] = None
    priority: int
    is_active: bool
    created_at: datetime
    last_run_status: Optional[str] = None
    last_run_at: Optional[datetime] = None

    class Config:
        from_attributes = True
