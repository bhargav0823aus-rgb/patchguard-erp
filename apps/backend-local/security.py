"""Password hashing + JWT + role-based access dependencies."""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, Header, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_session
from models_db import Role, User

JWT_SECRET = os.environ.get("JWT_SECRET", "dev-secret-change-me")
JWT_ALGO = "HS256"
JWT_EXPIRES_HOURS = int(os.environ.get("JWT_EXPIRES_HOURS", "8"))
WORKER_TOKEN = os.environ.get("WORKER_TOKEN", "dev-worker-token")

pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer = HTTPBearer(auto_error=False)


def hash_password(plain: str) -> str:
    return pwd.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd.verify(plain, hashed)


def create_token(user: User) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user.id,
        "role": user.role.value,
        "email": user.email,
        "iat": now,
        "exp": now + timedelta(hours=JWT_EXPIRES_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


async def current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    session: AsyncSession = Depends(get_session),
) -> User:
    if creds is None:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALGO])
    except jwt.PyJWTError as e:
        raise HTTPException(401, f"Invalid token: {e}") from e
    user = (
        await session.execute(select(User).where(User.id == payload.get("sub")))
    ).scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(401, "User not found or deactivated")
    return user


def require_role(*roles: Role):
    """Dependency factory: endpoint allowed only for the given roles."""

    async def checker(user: User = Depends(current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(403, f"Requires role: {', '.join(r.value for r in roles)}")
        return user

    return checker


async def require_worker_token(x_worker_token: str | None = Header(default=None)) -> None:
    """Static shared-secret check for the capture worker's upload endpoint."""
    if x_worker_token != WORKER_TOKEN:
        raise HTTPException(401, "Invalid worker token")
