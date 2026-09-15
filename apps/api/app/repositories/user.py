"""Репозиторий пользователей."""

from __future__ import annotations

from datetime import UTC, date, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User, UserSettings


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def get_user_by_username(db: AsyncSession, username: str) -> User | None:
    result = await db.execute(select(User).where(User.username == username))
    return result.scalar_one_or_none()


async def get_user_by_id(db: AsyncSession, user_id: UUID) -> User | None:
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def create_user(
    db: AsyncSession,
    *,
    email: str,
    password_hash: str,
    username: str,
    birth_date: date | None = None,
) -> User:
    user = User(
        email=email,
        password_hash=password_hash,
        username=username,
        birth_date=birth_date,
    )
    db.add(user)
    await db.flush()
    # one-to-one настройки создаются сразу
    settings = UserSettings(user_id=user.id)
    db.add(settings)
    await db.flush()
    return user


async def verify_email(db: AsyncSession, user_id: UUID) -> None:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is not None:
        user.email_verified_at = datetime.now(tz=UTC)


async def update_password(db: AsyncSession, user_id: UUID, password_hash: str) -> None:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is not None:
        user.password_hash = password_hash
