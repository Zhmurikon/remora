"""Запросы дневной активности и серий."""

from datetime import date
from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.retention import DailyActivity, Streak


async def activity_for_update(
    db: AsyncSession, user_id: UUID, activity_date: date
) -> DailyActivity:
    row = await db.scalar(
        select(DailyActivity)
        .where(
            DailyActivity.user_id == user_id,
            DailyActivity.activity_date == activity_date,
        )
        .with_for_update()
    )
    if row is None:
        row = DailyActivity(user_id=user_id, activity_date=activity_date)
        db.add(row)
        await db.flush()
    return row


async def list_activity(
    db: AsyncSession, user_id: UUID, start: date | None = None, end: date | None = None
) -> list[DailyActivity]:
    query = select(DailyActivity).where(DailyActivity.user_id == user_id)
    if start is not None:
        query = query.where(DailyActivity.activity_date >= start)
    if end is not None:
        query = query.where(DailyActivity.activity_date <= end)
    rows = await db.scalars(query.order_by(DailyActivity.activity_date))
    return list(rows.all())


async def delete_freezes(db: AsyncSession, user_id: UUID) -> None:
    await db.execute(
        delete(DailyActivity).where(
            DailyActivity.user_id == user_id,
            DailyActivity.is_frozen.is_(True),
            DailyActivity.reviews_count == 0,
        )
    )


async def streak_for_update(db: AsyncSession, user_id: UUID) -> Streak:
    row = await db.scalar(select(Streak).where(Streak.user_id == user_id).with_for_update())
    if row is None:
        total_xp = await db.scalar(
            select(func.coalesce(func.sum(DailyActivity.xp_earned), 0)).where(
                DailyActivity.user_id == user_id
            )
        )
        row = Streak(user_id=user_id, total_xp=int(total_xp or 0))
        db.add(row)
        await db.flush()
    return row
