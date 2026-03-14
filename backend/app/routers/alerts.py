from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from app.database import get_db
from app.models import Script, AlertConfig
from app.schemas.alert import AlertConfigCreate, AlertConfigResponse

router = APIRouter(tags=["alerts"])


@router.post("/api/alerts/{alert_id}/test", status_code=200)
async def test_alert(alert_id: int, session: AsyncSession = Depends(get_db)):
    from app.services.alerts import send_alert

    alert = await session.get(AlertConfig, alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    script = await session.get(Script, alert.script_id)
    if not script:
        raise HTTPException(status_code=404, detail="Script not found")

    try:
        send_alert(
            channel=alert.channel,
            destination=alert.destination,
            script_name=script.name,
            run_id=0,
            status="test",
            tag=script.tag,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send test alert: {str(e)}")

    return {"ok": True, "message": f"Test alert sent to {alert.destination}"}


@router.get("/api/scripts/{script_id}/alerts", response_model=List[AlertConfigResponse])
async def get_script_alerts(script_id: int, session: AsyncSession = Depends(get_db)):
    script = await session.get(Script, script_id)
    if not script:
        raise HTTPException(status_code=404, detail="Script not found")

    result = await session.execute(
        select(AlertConfig).where(AlertConfig.script_id == script_id)
    )
    return result.scalars().all()


@router.post("/api/scripts/{script_id}/alerts", response_model=AlertConfigResponse, status_code=201)
async def create_script_alert(
    script_id: int, data: AlertConfigCreate, session: AsyncSession = Depends(get_db)
):
    script = await session.get(Script, script_id)
    if not script:
        raise HTTPException(status_code=404, detail="Script not found")

    alert = AlertConfig(script_id=script_id, **data.model_dump())
    session.add(alert)
    await session.flush()
    await session.refresh(alert)
    return alert


@router.delete("/api/alerts/{alert_id}", status_code=204)
async def delete_alert(alert_id: int, session: AsyncSession = Depends(get_db)):
    alert = await session.get(AlertConfig, alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    await session.delete(alert)
