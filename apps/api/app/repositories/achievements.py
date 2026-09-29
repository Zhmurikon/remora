"""Запросы справочника и выданных достижений."""

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.retention import Achievement, UserAchievement


async def list_definitions(db: AsyncSession) -> list[Achievement]:
    return list((await db.scalars(select(Achievement).order_by(Achievement.sort_order))).all())


async def list_unlocked(db: AsyncSession, user_id: UUID) -> list[UserAchievement]:
    return list(
        (await db.scalars(select(UserAchievement).where(UserAchievement.user_id == user_id))).all()
    )


async def mark_seen(db: AsyncSession, user_id: UUID) -> None:
    await db.execute(
        update(UserAchievement)
        .where(UserAchievement.user_id == user_id, UserAchievement.seen_at.is_(None))
        .values(seen_at=datetime.now(UTC))
    )
