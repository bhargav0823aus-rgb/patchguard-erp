from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_session
from models_db import User
from security import create_token, current_user, verify_password

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    id: str
    email: str
    full_name: str
    role: str
    is_active: bool


class LoginResponse(BaseModel):
    token: str
    user: UserOut


def _user_out(u: User) -> UserOut:
    return UserOut(
        id=u.id, email=u.email, full_name=u.full_name, role=u.role.value, is_active=u.is_active
    )


@router.post("/login", response_model=LoginResponse)
async def login(req: LoginRequest, session: AsyncSession = Depends(get_session)) -> LoginResponse:
    user = (
        await session.execute(select(User).where(User.email == req.email.lower().strip()))
    ).scalar_one_or_none()
    if user is None or not verify_password(req.password, user.password_hash):
        raise HTTPException(401, "Invalid email or password")
    if not user.is_active:
        raise HTTPException(403, "Account deactivated")
    return LoginResponse(token=create_token(user), user=_user_out(user))


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(current_user)) -> UserOut:
    return _user_out(user)
