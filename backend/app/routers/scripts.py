import json
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from typing import List, Optional
from datetime import datetime, timezone

import redis as redis_lib
from app.config import settings
from app.database import get_db
from app.models import Script, ScriptRun
from app.schemas.script import ScriptCreate, ScriptUpdate, ScriptResponse, ScriptListResponse
from app.celery_app import get_queue_name

router = APIRouter(prefix="/api/scripts", tags=["scripts"])

_redis = redis_lib.from_url(settings.redis_url, socket_connect_timeout=2)
_BEAT_RELOAD_KEY = "beat:force_reload"


def _signal_beat_reload():
    """Tell celery-beat to reload the schedule from DB on its next tick."""
    try:
        _redis.set(_BEAT_RELOAD_KEY, "1", ex=300)
    except Exception:
        pass  # non-critical — beat will reload on its regular 60s interval anyway


def _gen_token() -> str:
    return uuid.uuid4().hex


async def _enrich_script(script: Script, session: AsyncSession) -> dict:
    last_run = await session.execute(
        select(ScriptRun)
        .where(ScriptRun.script_id == script.id)
        .order_by(desc(ScriptRun.created_at))
        .limit(1)
    )
    last_run = last_run.scalar_one_or_none()
    return {
        "id": script.id,
        "name": script.name,
        "description": script.description,
        "script_content": script.script_content,
        "requirements_content": script.requirements_content,
        "cron_expression": script.cron_expression,
        "timeout_seconds": script.timeout_seconds,
        "priority": script.priority,
        "max_retries": script.max_retries,
        "cpu_cores": script.cpu_cores,
        "ram_limit_mb": script.ram_limit_mb,
        "is_active": script.is_active,
        "webhook_token": script.webhook_token,
        "parameters_schema": script.parameters_schema,
        "tag": script.tag,
        "python_env_id": script.python_env_id,
        "created_at": script.created_at,
        "updated_at": script.updated_at,
        "last_run_status": last_run.status if last_run else None,
        "last_run_at": last_run.created_at if last_run else None,
    }


@router.get("", response_model=List[ScriptListResponse])
async def list_scripts(session: AsyncSession = Depends(get_db)):
    result = await session.execute(select(Script).order_by(desc(Script.created_at)))
    scripts = result.scalars().all()
    enriched = []
    for script in scripts:
        data = await _enrich_script(script, session)
        enriched.append(ScriptListResponse(**data))
    return enriched


@router.post("", response_model=ScriptResponse, status_code=status.HTTP_201_CREATED)
async def create_script(data: ScriptCreate, session: AsyncSession = Depends(get_db)):
    script = Script(**data.model_dump(), webhook_token=_gen_token())
    session.add(script)
    await session.flush()
    await session.refresh(script)
    enriched = await _enrich_script(script, session)
    if script.is_active and script.cron_expression:
        _signal_beat_reload()
    return ScriptResponse(**enriched)


@router.get("/{script_id}", response_model=ScriptResponse)
async def get_script(script_id: int, session: AsyncSession = Depends(get_db)):
    script = await session.get(Script, script_id)
    if not script:
        raise HTTPException(status_code=404, detail="Script not found")
    enriched = await _enrich_script(script, session)
    return ScriptResponse(**enriched)


@router.put("/{script_id}", response_model=ScriptResponse)
async def update_script(
    script_id: int, data: ScriptUpdate, session: AsyncSession = Depends(get_db)
):
    script = await session.get(Script, script_id)
    if not script:
        raise HTTPException(status_code=404, detail="Script not found")
    updated_fields = data.model_dump(exclude_unset=True)
    for field, value in updated_fields.items():
        setattr(script, field, value)
    script.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await session.flush()
    await session.refresh(script)
    enriched = await _enrich_script(script, session)
    # Signal beat if schedule-related fields changed
    if any(f in updated_fields for f in ("cron_expression", "is_active", "priority")):
        _signal_beat_reload()
    return ScriptResponse(**enriched)


@router.delete("/{script_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_script(script_id: int, session: AsyncSession = Depends(get_db)):
    script = await session.get(Script, script_id)
    if not script:
        raise HTTPException(status_code=404, detail="Script not found")
    await session.delete(script)


@router.patch("/{script_id}/toggle", response_model=ScriptResponse)
async def toggle_script(script_id: int, session: AsyncSession = Depends(get_db)):
    script = await session.get(Script, script_id)
    if not script:
        raise HTTPException(status_code=404, detail="Script not found")
    script.is_active = not script.is_active
    script.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await session.flush()
    await session.refresh(script)
    enriched = await _enrich_script(script, session)
    if script.cron_expression:
        _signal_beat_reload()
    return ScriptResponse(**enriched)


@router.patch("/{script_id}/regenerate-webhook", response_model=ScriptResponse)
async def regenerate_webhook(script_id: int, session: AsyncSession = Depends(get_db)):
    script = await session.get(Script, script_id)
    if not script:
        raise HTTPException(status_code=404, detail="Script not found")
    script.webhook_token = _gen_token()
    script.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await session.flush()
    await session.refresh(script)
    enriched = await _enrich_script(script, session)
    return ScriptResponse(**enriched)


@router.post("/{script_id}/run", status_code=status.HTTP_201_CREATED)
async def run_script_now(
    script_id: int,
    session: AsyncSession = Depends(get_db),
    body: Optional[dict] = None,
):
    from app.tasks import execute_script

    script = await session.get(Script, script_id)
    if not script:
        raise HTTPException(status_code=404, detail="Script not found")

    # If no parameters provided, fall back to defaults from parameters_schema
    effective_params = body
    if not effective_params and script.parameters_schema:
        try:
            schema = json.loads(script.parameters_schema)
            if isinstance(schema, list):
                defaults = {
                    p["name"]: p["default"]
                    for p in schema
                    if p.get("name") and p.get("default") not in (None, "")
                }
                if defaults:
                    effective_params = defaults
        except Exception:
            pass

    run = ScriptRun(
        script_id=script.id,
        status="pending",
        triggered_by="manual",
        attempt_number=1,
        parameters=json.dumps(effective_params) if effective_params else None,
    )
    session.add(run)
    await session.flush()
    await session.refresh(run)

    # Commit before dispatching so the run record is visible to the celery worker
    await session.commit()

    task = execute_script.apply_async(
        args=[script.id, run.id],
        queue=get_queue_name(script.priority),
    )
    run.celery_task_id = task.id
    await session.merge(run)

    return {"run_id": run.id, "task_id": task.id}
