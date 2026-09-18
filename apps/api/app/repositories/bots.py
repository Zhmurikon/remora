from datetime import datetime
from uuid import UUID

from sqlalchemy import delete, select, text, tuple_
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.models.bots import BotEvent, BotLink, BotLinkCode
from app.schemas.bots import BotEventIn, BotPlatform


async def lock(db: AsyncSession, key: str) -> None:
    await db.execute(
        text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"), {"key": "bot:" + key}
    )


async def links(db: AsyncSession, user_id: UUID) -> list[BotLink]:
    return list((await db.scalars(select(BotLink).where(BotLink.user_id == user_id))).all())


async def actor_link(db: AsyncSession, platform: str, actor_id: str) -> BotLink | None:
    result = await db.scalars(
        select(BotLink).where(BotLink.platform == platform, BotLink.actor_id == actor_id)
    )
    return result.first()


async def clear_codes(db: AsyncSession, user_id: UUID, platform: str) -> None:
    await db.execute(
        delete(BotLinkCode).where(BotLinkCode.user_id == user_id, BotLinkCode.platform == platform)
    )


async def enqueue(db: AsyncSession, platform: BotPlatform, body: BotEventIn) -> None:
    await db.execute(
        insert(BotEvent)
        .values(platform=platform.value, **body.model_dump())
        .on_conflict_do_nothing(index_elements=["platform", "event_id"])
    )


async def next_event(db: AsyncSession, platform: str, now: datetime) -> BotEvent | None:
    # Сохраняем порядок одного диалога, но сбой получателя не блокирует остальных.
    await lock(db, "delivery:" + platform)
    older = aliased(BotEvent)
    preceding = (
        select(older.id)
        .where(
            older.platform == BotEvent.platform,
            older.actor_id == BotEvent.actor_id,
            older.status.in_(["pending", "sending"]),
            tuple_(older.created_at, older.id) < tuple_(BotEvent.created_at, BotEvent.id),
        )
        .exists()
    )
    result = await db.scalars(
        select(BotEvent)
        .where(
            BotEvent.platform == platform,
            BotEvent.status.in_(["pending", "sending"]),
            BotEvent.available_at <= now,
            ~preceding,
        )
        .order_by(BotEvent.created_at, BotEvent.id)
        .limit(1)
        .with_for_update()
    )
    return result.first()
