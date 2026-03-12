from pydantic import BaseModel, Field
from typing import Optional
from enum import Enum


class AlertChannel(str, Enum):
    email = "email"
    telegram = "telegram"


class AlertConfigCreate(BaseModel):
    on_failure: bool = True
    on_success: bool = False
    on_timeout: bool = True
    channel: AlertChannel
    destination: str = Field(..., min_length=1, max_length=500)


class AlertConfigResponse(BaseModel):
    id: int
    script_id: int
    on_failure: bool
    on_success: bool
    on_timeout: bool
    channel: str
    destination: str

    class Config:
        from_attributes = True
