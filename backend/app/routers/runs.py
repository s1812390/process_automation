import asyncio
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func
from typing import Optional

from app.database import get_db
from app.models import Script, ScriptRun, RunLog
from app.schemas.run import RunResponse, RunListResponse, LogLineResponse

router = APIRouter(prefix="/api/runs", tags=["runs"])


async def _enrich_run(run: ScriptRun, session: AsyncSession) -> dict:
    script = await session.get(Script, run.script_id)
    return {
        "id": run.id,
        "script_id": run.script_id,
        "script_name": script.name if script else None,
        "status": run.status,
        "triggered_by": run.triggered_by,
        "started_at": run.started_at,
        "finished_at": run.finished_at,
        "duration_ms": run.duration_ms,
        "attempt_number": run.attempt_number,
        "celery_task_id": run.celery_task_id,
        "worker_pid": run.worker_pid,
        "created_at": run.created_at,
    }


@router.get("", response_model=RunListResponse)
async def list_runs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    script_id: Optional[int] = None,
    status: Optional[str] = None,
    session: AsyncSession = Depends(get_db),
):
    query = select(ScriptRun)
    if script_id:
        query = query.where(ScriptRun.script_id == script_id)
    if status:
        query = query.where(ScriptRun.status == status)

    total_result = await session.execute(
        select(func.count()).select_from(query.subquery())
    )
    total = total_result.scalar()

    runs_result = await session.execute(
        query.order_by(desc(ScriptRun.created_at))
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    runs = runs_result.scalars().all()

    items = []
    for run in runs:
        data = await _enrich_run(run, session)
        items.append(RunResponse(**data))

    return RunListResponse(items=items, total=total, page=page, page_size=page_size)


@router.get("/active", response_model=list)
async def get_active_runs(session: AsyncSession = Depends(get_db)):
    result = await session.execute(
        select(ScriptRun)
        .where(ScriptRun.status.in_(["running", "pending"]))
        .order_by(desc(ScriptRun.created_at))
    )
    runs = result.scalars().all()
    items = []
    for run in runs:
        data = await _enrich_run(run, session)
        items.append(data)
    return items


@router.get("/{run_id}", response_model=RunResponse)
async def get_run(run_id: int, session: AsyncSession = Depends(get_db)):
    run = await session.get(ScriptRun, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    data = await _enrich_run(run, session)
    return RunResponse(**data)


@router.delete("/{run_id}", status_code=204)
async def cancel_run(run_id: int, session: AsyncSession = Depends(get_db)):
    import os
    import signal
    from app.celery_app import celery_app

    run = await session.get(ScriptRun, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    if run.status not in ("running", "pending"):
        raise HTTPException(status_code=400, detail="Run is not active")

    if run.celery_task_id:
        celery_app.control.revoke(run.celery_task_id, terminate=True, signal="SIGTERM")

    if run.worker_pid:
        try:
            os.kill(run.worker_pid, signal.SIGTERM)
        except (ProcessLookupError, PermissionError):
            pass

    run.status = "cancelled"
    await session.flush()


@router.get("/{run_id}/logs", response_model=list)
async def get_run_logs(run_id: int, session: AsyncSession = Depends(get_db)):
    run = await session.get(ScriptRun, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    result = await session.execute(
        select(RunLog).where(RunLog.run_id == run_id).order_by(RunLog.id)
    )
    logs = result.scalars().all()
    return [
        {"id": log.id, "run_id": log.run_id, "logged_at": log.logged_at, "stream": log.stream, "line_text": log.line_text}
        for log in logs
    ]


@router.get("/{run_id}/logs/stream")
async def stream_logs(run_id: int, session: AsyncSession = Depends(get_db)):
    import json

    async def event_generator():
        from app.database import AsyncSessionLocal
        offset = 0

        async with AsyncSessionLocal() as db:
            while True:
                # Check run status
                run = await db.get(ScriptRun, run_id)
                if not run:
                    yield f"data: {json.dumps({'type': 'error', 'message': 'Run not found'})}\n\n"
                    return

                # Fetch new logs
                result = await db.execute(
                    select(RunLog)
                    .where(RunLog.run_id == run_id)
                    .order_by(RunLog.id)
                    .offset(offset)
                    .limit(100)
                )
                new_logs = result.scalars().all()

                for log in new_logs:
                    data = {
                        "id": log.id,
                        "stream": log.stream,
                        "line_text": log.line_text,
                        "logged_at": log.logged_at.isoformat() if log.logged_at else None,
                    }
                    yield f"data: {json.dumps(data)}\n\n"
                    offset += 1

                if run.status not in ("running", "pending"):
                    yield f"data: {json.dumps({'type': 'done'})}\n\n"
                    return

                await asyncio.sleep(1)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
