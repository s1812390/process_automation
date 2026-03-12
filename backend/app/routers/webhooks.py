import json
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models import Script, ScriptRun
from app.celery_app import get_queue_name

router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])


@router.post("/{token}", status_code=status.HTTP_201_CREATED)
async def trigger_webhook(
    token: str,
    request: Request,
    session: AsyncSession = Depends(get_db),
):
    result = await session.execute(
        select(Script).where(Script.webhook_token == token, Script.is_active == True)
    )
    script = result.scalar_one_or_none()
    if not script:
        raise HTTPException(status_code=404, detail="Webhook not found or script is inactive")

    # Accept any JSON body as parameters
    parameters: dict = {}
    try:
        body = await request.json()
        if isinstance(body, dict):
            parameters = body
    except Exception:
        pass

    from app.tasks import execute_script

    run = ScriptRun(
        script_id=script.id,
        status="pending",
        triggered_by="webhook",
        attempt_number=1,
        parameters=json.dumps(parameters) if parameters else None,
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

    return {"run_id": run.id, "task_id": task.id, "script_id": script.id}
