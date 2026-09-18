from uuid import UUID

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.api_tokens import AgentRequest, ApiToken


async def list_tokens(db: AsyncSession, user_id: UUID) -> list[ApiToken]:
    return list(
        (
            await db.scalars(
                select(ApiToken)
                .where(ApiToken.user_id == user_id)
                .order_by(ApiToken.created_at.desc())
            )
        ).all()
    )


async def get_token(db: AsyncSession, token_id: UUID) -> ApiToken | None:
    return await db.get(ApiToken, token_id)


async def by_hash(db: AsyncSession, digest: str) -> ApiToken | None:
    result: ApiToken | None = await db.scalar(select(ApiToken).where(ApiToken.token_hash == digest))
    return result


async def lock_request(db: AsyncSession, user_id: UUID) -> None:
    # Сериализация записей агента защищает также перестановку разделов и карточек.
    await db.execute(
        text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"), {"key": f"agent:{user_id}"}
    )


async def previous_request(db: AsyncSession, user_id: UUID, key: str) -> AgentRequest | None:
    result: AgentRequest | None = await db.scalar(
        select(AgentRequest).where(AgentRequest.user_id == user_id, AgentRequest.key == key)
    )
    return result
