from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class GlobalVarCreate(BaseModel):
    key: str = Field(..., min_length=1, max_length=200)
    value: str
    description: Optional[str] = Field(None, max_length=500)


class GlobalVarUpdate(BaseModel):
    value: Optional[str] = None
    description: Optional[str] = Field(None, max_length=500)


class GlobalVarResponse(BaseModel):
    id: int
    key: str
    value: str
    description: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
