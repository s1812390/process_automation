from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from app.database import get_db
from app.models import GlobalVar
from app.schemas.variable import GlobalVarCreate, GlobalVarUpdate, GlobalVarResponse

router = APIRouter(prefix="/api/variables", tags=["variables"])


@router.get("", response_model=List[GlobalVarResponse])
async def list_vars(session: AsyncSession = Depends(get_db)):
    result = await session.execute(select(GlobalVar).order_by(GlobalVar.key))
    return result.scalars().all()


@router.post("", response_model=GlobalVarResponse, status_code=status.HTTP_201_CREATED)
async def create_var(data: GlobalVarCreate, session: AsyncSession = Depends(get_db)):
    existing = await session.execute(select(GlobalVar).where(GlobalVar.key == data.key))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"Variable '{data.key}' already exists")
    var = GlobalVar(**data.model_dump())
    session.add(var)
    await session.flush()
    await session.refresh(var)
    return var


@router.put("/{var_id}", response_model=GlobalVarResponse)
async def update_var(var_id: int, data: GlobalVarUpdate, session: AsyncSession = Depends(get_db)):
    var = await session.get(GlobalVar, var_id)
    if not var:
        raise HTTPException(status_code=404, detail="Variable not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(var, field, value)
    await session.flush()
    await session.refresh(var)
    return var


@router.delete("/{var_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_var(var_id: int, session: AsyncSession = Depends(get_db)):
    var = await session.get(GlobalVar, var_id)
    if not var:
        raise HTTPException(status_code=404, detail="Variable not found")
    await session.delete(var)
