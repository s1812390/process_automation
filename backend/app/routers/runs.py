import asyncio
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func

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
    page_size: int = Query(20, ge=1, le=2000),
    script_id: Optional[int] = None,
    script_ids: Optional[List[int]] = Query(None),
    status: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    session: AsyncSession = Depends(get_db),
):
    # Normalize date filters to UTC naive so they compare correctly against Oracle
    # DATE columns (which are stored as naive UTC).  If the client sends a
    # timezone-aware datetime (e.g. "2026-03-18T00:00:00+05:00"), convert to UTC
    # first; if it sends a naive datetime, assume it is already UTC.
    def _utc_naive(dt: Optional[datetime]) -> Optional[datetime]:
        if dt is None:
            return None
        if dt.tzinfo is not None:
            return dt.astimezone(timezone.utc).replace(tzinfo=None)
        return dt

    date_from = _utc_naive(date_from)
    date_to = _utc_naive(date_to)

    query = select(ScriptRun)
    if script_ids:
        query = query.where(ScriptRun.script_id.in_(script_ids))
    elif script_id:
        query = query.where(ScriptRun.script_id == script_id)
    if status:
        query = query.where(ScriptRun.status == status)
    if date_from:
        query = query.where(ScriptRun.created_at >= date_from)
    if date_to:
        query = query.where(ScriptRun.created_at <= date_to)

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
    from app.celery_app import celery_app

    run = await session.get(ScriptRun, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    if run.status not in ("running", "pending"):
        raise HTTPException(status_code=400, detail="Run is not active")

    # Revoke the Celery task and send SIGTERM to the worker process.
    # The execute_script task has a SIGTERM handler that kills the subprocess
    # process group (os.killpg), so the actual Python script is terminated cleanly.
    # Note: os.kill(worker_pid) is intentionally NOT used here — the API runs in a
    # different container from celery-worker, so that PID refers to an unrelated
    # process in this container.
    if run.celery_task_id:
        celery_app.control.revoke(run.celery_task_id, terminate=True, signal="SIGTERM")

    run.status = "cancelled"
    run.finished_at = datetime.now(timezone.utc).replace(tzinfo=None)

    # Write a log entry so the cancellation is visible in the run's log history
    cancel_log = RunLog(
        run_id=run_id,
        stream="stderr",
        line_text="[Process killed by user]",
    )
    session.add(cancel_log)
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

    _SSE_TIMEOUT = 8 * 3600  # 8 hours — safety net if a run gets permanently stuck

    async def event_generator():
        from app.database import AsyncSessionLocal
        offset = 0
        deadline = asyncio.get_event_loop().time() + _SSE_TIMEOUT

        async with AsyncSessionLocal() as db:
            while True:
                if asyncio.get_event_loop().time() > deadline:
                    yield f"data: {json.dumps({'type': 'timeout', 'message': 'Stream closed after 8 hours'})}\n\n"
                    return

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
