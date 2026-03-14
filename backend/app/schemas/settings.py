from pydantic import BaseModel
from typing import Optional


class SettingsResponse(BaseModel):
    max_concurrent_workers: int = 2
    default_timeout_seconds: int = 3600
    default_max_retries: int = 0
    default_cpu_cores: Optional[int] = None
    default_ram_limit_mb: Optional[int] = None
    timezone: str = "Asia/Almaty"
    # Global admin alerts
    global_alert_on_failure: bool = False
    global_alert_on_timeout: bool = False
    global_alert_channel: Optional[str] = None
    global_alert_destination: Optional[str] = None


class SettingsUpdate(BaseModel):
    max_concurrent_workers: Optional[int] = None
    default_timeout_seconds: Optional[int] = None
    default_max_retries: Optional[int] = None
    default_cpu_cores: Optional[int] = None
    default_ram_limit_mb: Optional[int] = None
    timezone: Optional[str] = None
    # Global admin alerts
    global_alert_on_failure: Optional[bool] = None
    global_alert_on_timeout: Optional[bool] = None
    global_alert_channel: Optional[str] = None
    global_alert_destination: Optional[str] = None
