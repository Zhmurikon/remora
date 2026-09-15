"""Хранение и атомарное погашение одноразовых токенов действий."""

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import ActionToken


async def create_token(
    db: AsyncSession,
    *,
    user_id: UUID,
    token_hash: str,
    purpose: str,
    expires_at: datetime,
) -> ActionToken:
    token = ActionToken(
        user_id=user_id,
        token_hash=token_hash,
        purpose=purpose,
        expires_at=expires_at,
    )
    db.add(token)
    await db.flush()
    return token


async def consume_token(
    db: AsyncSession,
    *,
    token_hash: str,
    purpose: str,
    user_id: UUID,
) -> bool:
    """Блокирует строку, чтобы два запроса не погасили одну ссылку."""
    now = datetime.now(tz=UTC)
    result = await db.execute(
        select(ActionToken)
        .where(
            ActionToken.token_hash == token_hash,
            ActionToken.purpose == purpose,
            ActionToken.user_id == user_id,
            ActionToken.consumed_at.is_(None),
            ActionToken.expires_at > now,
        )
        .with_for_update()
    )
    token = result.scalar_one_or_none()
    if token is None:
        return False
    token.consumed_at = now
    await db.flush()
    return True


async def consume_active_tokens(
    db: AsyncSession,
    *,
    user_id: UUID,
    purpose: str,
) -> None:
    """После успешного действия гасит остальные ранее выданные ссылки."""
    now = datetime.now(tz=UTC)
    await db.execute(
        update(ActionToken)
        .where(
            ActionToken.user_id == user_id,
            ActionToken.purpose == purpose,
            ActionToken.consumed_at.is_(None),
        )
        .values(consumed_at=now)
    )
