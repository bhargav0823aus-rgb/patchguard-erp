from __future__ import annotations

import os
from datetime import date
from decimal import Decimal
from pathlib import Path

from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from geoalchemy2.functions import ST_AsText
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_session
from geo import linestring_wkt, parse_linestring_wkt
from models_db import Contractor, Role, User, WorkRecord
from security import current_user, require_role

router = APIRouter(prefix="/api/v1/contractors", tags=["contractors"])

admin_only = require_role(Role.admin)
INVOICE_DIR = Path(os.environ.get("DATA_DIR", "./data")).resolve() / "invoices"


class ContractorIn(BaseModel):
    name: str
    abn: str | None = None
    contact_email: str | None = None
    phone: str | None = None


class ContractorOut(ContractorIn):
    id: str
    work_record_count: int = 0


class WorkRecordIn(BaseModel):
    title: str
    work_date: date
    cost: Decimal
    hours_spent: Decimal
    guarantee_months: int
    path: list[list[float]] | None = None  # [[lat, lng], ...] from the map editor
    notes: str | None = None


class WorkRecordOut(BaseModel):
    id: str
    contractor_id: str
    title: str
    work_date: date
    cost: Decimal
    hours_spent: Decimal
    guarantee_months: int
    guarantee_expires: date
    path: list[list[float]] | None
    has_invoice: bool
    notes: str | None


async def _work_out(session: AsyncSession, wr: WorkRecord) -> WorkRecordOut:
    path = None
    if wr.path is not None:
        wkt = (await session.execute(select(ST_AsText(WorkRecord.path)).where(WorkRecord.id == wr.id))).scalar_one()
        if wkt:
            path = parse_linestring_wkt(wkt)
    return WorkRecordOut(
        id=wr.id,
        contractor_id=wr.contractor_id,
        title=wr.title,
        work_date=wr.work_date,
        cost=wr.cost,
        hours_spent=wr.hours_spent,
        guarantee_months=wr.guarantee_months,
        guarantee_expires=wr.guarantee_expires,
        path=path,
        has_invoice=bool(wr.invoice_path),
        notes=wr.notes,
    )


@router.get("", response_model=list[ContractorOut])
async def list_contractors(
    _: User = Depends(current_user), session: AsyncSession = Depends(get_session)
) -> list[ContractorOut]:
    contractors = (await session.execute(select(Contractor).order_by(Contractor.name))).scalars().all()
    out = []
    for c in contractors:
        count = len(
            (await session.execute(select(WorkRecord.id).where(WorkRecord.contractor_id == c.id)))
            .scalars()
            .all()
        )
        out.append(
            ContractorOut(
                id=c.id, name=c.name, abn=c.abn, contact_email=c.contact_email,
                phone=c.phone, work_record_count=count,
            )
        )
    return out


@router.post("", response_model=ContractorOut, status_code=201)
async def create_contractor(
    req: ContractorIn,
    _: User = Depends(admin_only),
    session: AsyncSession = Depends(get_session),
) -> ContractorOut:
    c = Contractor(name=req.name, abn=req.abn, contact_email=req.contact_email, phone=req.phone)
    session.add(c)
    await session.commit()
    return ContractorOut(id=c.id, **req.model_dump())


@router.get("/{contractor_id}/work-records", response_model=list[WorkRecordOut])
async def list_work_records(
    contractor_id: str,
    _: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> list[WorkRecordOut]:
    records = (
        await session.execute(
            select(WorkRecord)
            .where(WorkRecord.contractor_id == contractor_id)
            .order_by(WorkRecord.work_date.desc())
        )
    ).scalars().all()
    return [await _work_out(session, wr) for wr in records]


@router.post("/{contractor_id}/work-records", response_model=WorkRecordOut, status_code=201)
async def create_work_record(
    contractor_id: str,
    req: WorkRecordIn,
    admin: User = Depends(admin_only),
    session: AsyncSession = Depends(get_session),
) -> WorkRecordOut:
    contractor = (
        await session.execute(select(Contractor).where(Contractor.id == contractor_id))
    ).scalar_one_or_none()
    if contractor is None:
        raise HTTPException(404, "Contractor not found")
    if req.path is not None and len(req.path) < 2:
        raise HTTPException(422, "Work path needs at least 2 points")

    wr = WorkRecord(
        contractor_id=contractor_id,
        title=req.title,
        work_date=req.work_date,
        cost=req.cost,
        hours_spent=req.hours_spent,
        guarantee_months=req.guarantee_months,
        guarantee_expires=req.work_date + relativedelta(months=req.guarantee_months),
        path=linestring_wkt(req.path) if req.path else None,
        notes=req.notes,
        created_by=admin.id,
    )
    session.add(wr)
    await session.commit()
    return await _work_out(session, wr)


@router.post("/work-records/{record_id}/invoice")
async def upload_invoice(
    record_id: str,
    file: UploadFile = File(...),
    _: User = Depends(admin_only),
    session: AsyncSession = Depends(get_session),
) -> dict:
    wr = (
        await session.execute(select(WorkRecord).where(WorkRecord.id == record_id))
    ).scalar_one_or_none()
    if wr is None:
        raise HTTPException(404, "Work record not found")
    if file.content_type not in ("application/pdf", "application/octet-stream"):
        raise HTTPException(422, "Invoice must be a PDF")
    INVOICE_DIR.mkdir(parents=True, exist_ok=True)
    dest = INVOICE_DIR / f"{record_id}.pdf"
    dest.write_bytes(await file.read())
    wr.invoice_path = str(dest)
    await session.commit()
    return {"ok": True}


@router.get("/work-records/{record_id}/invoice")
async def download_invoice(
    record_id: str,
    _: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
):
    wr = (
        await session.execute(select(WorkRecord).where(WorkRecord.id == record_id))
    ).scalar_one_or_none()
    if wr is None or not wr.invoice_path or not Path(wr.invoice_path).exists():
        raise HTTPException(404, "No invoice on file")
    return FileResponse(wr.invoice_path, media_type="application/pdf", filename=f"invoice_{record_id}.pdf")
