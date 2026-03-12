from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from typing import List, Optional
from datetime import datetime, timezone

from app.database import get_db
from app.models import Script, ScriptRun
from app.schemas.script import ScriptCreate, ScriptUpdate, ScriptResponse, ScriptListResponse

router = APIRouter(prefix="/api/scripts", tags=["scripts"])


async def _enrich_script(script: Script, session: AsyncSession) -> dict:
    """Get last run info for a script."""
    last_run = await session.execute(
        select(ScriptRun)
        .where(ScriptRun.script_id == script.id)
        .order_by(desc(ScriptRun.created_at))
        .limit(1)
    )
    last_run = last_run.scalar_one_or_none()
    data = {
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
        "created_at": script.created_at,
        "updated_at": script.updated_at,
        "last_run_status": last_run.status if last_run else None,
        "last_run_at": last_run.created_at if last_run else None,
    }
    return data


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
    script = Script(**data.model_dump())
    session.add(script)
    await session.flush()
    await session.refresh(script)
    enriched = await _enrich_script(script, session)
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
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(script, field, value)
    script.updated_at = datetime.now(timezone.utc)
    await session.flush()
    await session.refresh(script)
    enriched = await _enrich_script(script, session)
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
    script.updated_at = datetime.now(timezone.utc)
    await session.flush()
    await session.refresh(script)
    enriched = await _enrich_script(script, session)
    return ScriptResponse(**enriched)


@router.post("/{script_id}/run", status_code=status.HTTP_201_CREATED)
async def run_script_now(script_id: int, session: AsyncSession = Depends(get_db)):
    from app.models import ScriptRun
    from app.celery_app import get_queue_name
    from app.tasks import execute_script

    script = await session.get(Script, script_id)
    if not script:
        raise HTTPException(status_code=404, detail="Script not found")

    run = ScriptRun(
        script_id=script.id,
        status="pending",
        triggered_by="manual",
        attempt_number=1,
    )
    session.add(run)
    await session.flush()
    await session.refresh(run)

    task = execute_script.apply_async(
        args=[script.id, run.id],
        queue=get_queue_name(script.priority),
    )
    run.celery_task_id = task.id
    await session.flush()

    return {"run_id": run.id, "task_id": task.id}
