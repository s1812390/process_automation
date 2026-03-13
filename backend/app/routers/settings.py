from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional

from app.database import get_db
from app.models import AppSetting
from app.schemas.settings import SettingsResponse, SettingsUpdate

router = APIRouter(prefix="/api/settings", tags=["settings"])


async def _get_settings_dict(session: AsyncSession) -> dict:
    result = await session.execute(select(AppSetting))
    settings = result.scalars().all()
    d = {s.key: s.value for s in settings}
    return d


def _parse_optional_int(val: Optional[str]) -> Optional[int]:
    if val is None or val == "":
        return None
    try:
        return int(val)
    except ValueError:
        return None


def _build_settings_response(d: dict) -> SettingsResponse:
    return SettingsResponse(
        max_concurrent_workers=int(d.get("max_concurrent_workers", "2")),
        default_timeout_seconds=int(d.get("default_timeout_seconds", "3600")),
        default_max_retries=int(d.get("default_max_retries", "0")),
        default_cpu_cores=_parse_optional_int(d.get("default_cpu_cores")),
        default_ram_limit_mb=_parse_optional_int(d.get("default_ram_limit_mb")),
        timezone=d.get("timezone", "Asia/Almaty"),
    )


@router.get("", response_model=SettingsResponse)
async def get_settings(session: AsyncSession = Depends(get_db)):
    d = await _get_settings_dict(session)
    return _build_settings_response(d)


@router.put("", response_model=SettingsResponse)
async def update_settings(data: SettingsUpdate, session: AsyncSession = Depends(get_db)):
    updates = data.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setting = await session.get(AppSetting, key)
        str_val = str(value) if value is not None else ""
        if setting:
            setting.value = str_val
        else:
            session.add(AppSetting(key=key, value=str_val))
    await session.flush()
    d = await _get_settings_dict(session)
    return _build_settings_response(d)
