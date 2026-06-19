from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_session
from models_db import (
    Action,
    ActionStatus,
    Contractor,
    Damage,
    Image,
    Role,
    User,
    WorkRecord,
)
from security import current_user, require_role

router = APIRouter(prefix="/api/v1/actions", tags=["actions"])

can_update = require_role(Role.admin, Role.inspector)


class ActionOut(BaseModel):
    id: str
    status: str
    distance_m: float
    auto_created: bool
    created_at: datetime
    resolved_at: datetime | None
    resolution_notes: str | None
    # autopopulated context
    contractor_id: str
    contractor_name: str
    work_record_id: str
    work_title: str
    work_date: str
    work_cost: float
    guarantee_expires: str
    damage_class: str | None
    damage_confidence: float | None
    image_id: str
    image_lat: float
    image_lng: float
    annotated_image_url: str
    vision_description: str | None


@router.get("", response_model=list[ActionOut])
async def list_actions(
    request: Request,
    status: str | None = None,
    _: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> list[ActionOut]:
    q = (
        select(Action, Contractor, WorkRecord, Image, Damage)
        .join(Contractor, Action.contractor_id == Contractor.id)
        .join(WorkRecord, Action.work_record_id == WorkRecord.id)
        .join(Image, Action.image_id == Image.id)
        .outerjoin(Damage, Action.damage_id == Damage.id)
        .order_by(Action.created_at.desc())
    )
    if status:
        q = q.where(Action.status == ActionStatus(status))
    rows = (await session.execute(q)).all()
    base = str(request.base_url).rstrip("/")
    return [
        ActionOut(
            id=a.id,
            status=a.status.value,
            distance_m=float(a.distance_m),
            auto_created=a.auto_created,
            created_at=a.created_at,
            resolved_at=a.resolved_at,
            resolution_notes=a.resolution_notes,
            contractor_id=c.id,
            contractor_name=c.name,
            work_record_id=wr.id,
            work_title=wr.title,
            work_date=wr.work_date.isoformat(),
            work_cost=float(wr.cost),
            guarantee_expires=wr.guarantee_expires.isoformat(),
            damage_class=d.damage_class if d else None,
            damage_confidence=d.confidence if d else None,
            image_id=img.id,
            image_lat=img.lat,
            image_lng=img.lng,
            annotated_image_url=f"{base}/api/v1/images/{img.id}/annotated",
            vision_description=img.vision_description,
        )
        for a, c, wr, img, d in rows
    ]


class UpdateAction(BaseModel):
    status: str
    resolution_notes: str | None = None


@router.patch("/{action_id}", response_model=dict)
async def update_action(
    action_id: str,
    req: UpdateAction,
    _: User = Depends(can_update),
    session: AsyncSession = Depends(get_session),
) -> dict:
    action = (
        await session.execute(select(Action).where(Action.id == action_id))
    ).scalar_one_or_none()
    if action is None:
        raise HTTPException(404, "Action not found")
    action.status = ActionStatus(req.status)
    if req.resolution_notes is not None:
        action.resolution_notes = req.resolution_notes
    if action.status in (ActionStatus.resolved, ActionStatus.disputed):
        action.resolved_at = datetime.now(timezone.utc)
    await session.commit()
    return {"ok": True, "status": action.status.value}
