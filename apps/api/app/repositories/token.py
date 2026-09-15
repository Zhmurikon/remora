"""Репозиторий refresh-токенов."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import RefreshToken


async def create_token(
    db: AsyncSession,
    *,
    user_id: UUID,
    token_hash: str,
    family_id: UUID,
    expires_at: datetime,
    user_agent: str | None = None,
    ip: str | None = None,
) -> RefreshToken:
    token = RefreshToken(
        user_id=user_id,
        token_hash=token_hash,
        family_id=family_id,
        expires_at=expires_at,
        user_agent=user_agent,
        ip=ip,
    )
    db.add(token)
    await db.flush()
    return token


async def get_token_by_hash(db: AsyncSession, token_hash: str) -> RefreshToken | None:
    result = await db.execute(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    )
    return result.scalar_one_or_none()


async def get_token_by_hash_for_update(
    db: AsyncSession, token_hash: str
) -> RefreshToken | None:
    """Блокирует токен до конца транзакции для безопасной ротации."""
    result = await db.execute(
        select(RefreshToken)
        .where(RefreshToken.token_hash == token_hash)
        .with_for_update()
    )
    return result.scalar_one_or_none()


async def revoke_token(db: AsyncSession, token_id: UUID) -> None:
    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.id == token_id)
        .values(revoked_at=datetime.now(tz=UTC))
    )


async def revoke_family(db: AsyncSession, family_id: UUID) -> None:
    """Отзывает все токены в семье — при детекции переиспользования."""
    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.family_id == family_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=datetime.now(tz=UTC))
    )


async def get_active_tokens_by_user(
    db: AsyncSession, user_id: UUID
) -> list[RefreshToken]:
    result = await db.execute(
        select(RefreshToken)
        .where(
            RefreshToken.user_id == user_id,
            RefreshToken.revoked_at.is_(None),
            RefreshToken.expires_at > datetime.now(tz=UTC),
        )
        .order_by(RefreshToken.expires_at.desc())
    )
    return list(result.scalars().all())


async def revoke_all_user_tokens(db: AsyncSession, user_id: UUID) -> None:
    await db.execute(
        update(RefreshToken)
        .where(
            RefreshToken.user_id == user_id,
            RefreshToken.revoked_at.is_(None),
        )
        .values(revoked_at=datetime.now(tz=UTC))
    )
