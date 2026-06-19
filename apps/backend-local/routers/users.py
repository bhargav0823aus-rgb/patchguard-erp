from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_session
from models_db import Role, User
from routers.auth import UserOut, _user_out
from security import hash_password, require_role

router = APIRouter(prefix="/api/v1/users", tags=["users"])

admin_only = require_role(Role.admin)


class CreateUser(BaseModel):
    # Plain pattern check rather than EmailStr — internal deployments use reserved
    # TLDs like .local which strict validators reject.
    email: str
    full_name: str
    role: Role
    password: str

    @field_validator("email")
    @classmethod
    def _email_shape(cls, v: str) -> str:
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", v.strip().lower()):
            raise ValueError("not a valid email address")
        return v.strip().lower()


class UpdateUser(BaseModel):
    full_name: str | None = None
    role: Role | None = None
    is_active: bool | None = None
    password: str | None = None  # set → reset password


@router.get("", response_model=list[UserOut])
async def list_users(
    _: User = Depends(admin_only), session: AsyncSession = Depends(get_session)
) -> list[UserOut]:
    users = (await session.execute(select(User).order_by(User.created_at))).scalars().all()
    return [_user_out(u) for u in users]


@router.post("", response_model=UserOut, status_code=201)
async def create_user(
    req: CreateUser,
    _: User = Depends(admin_only),
    session: AsyncSession = Depends(get_session),
) -> UserOut:
    email = req.email.lower().strip()
    exists = (await session.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if exists:
        raise HTTPException(409, "Email already registered")
    if len(req.password) < 8:
        raise HTTPException(422, "Password must be at least 8 characters")
    user = User(
        email=email,
        full_name=req.full_name,
        role=req.role,
        password_hash=hash_password(req.password),
    )
    session.add(user)
    await session.commit()
    return _user_out(user)


@router.patch("/{user_id}", response_model=UserOut)
async def update_user(
    user_id: str,
    req: UpdateUser,
    admin: User = Depends(admin_only),
    session: AsyncSession = Depends(get_session),
) -> UserOut:
    user = (await session.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None:
        raise HTTPException(404, "User not found")
    if req.is_active is False and user.id == admin.id:
        raise HTTPException(422, "You cannot deactivate your own account")
    if req.full_name is not None:
        user.full_name = req.full_name
    if req.role is not None:
        user.role = req.role
    if req.is_active is not None:
        user.is_active = req.is_active
    if req.password is not None:
        if len(req.password) < 8:
            raise HTTPException(422, "Password must be at least 8 characters")
        user.password_hash = hash_password(req.password)
    await session.commit()
    return _user_out(user)
