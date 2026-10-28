"""Хранение фиче-флагов, инцидентов и операционных агрегатов."""

from typing import cast
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.admin_operations import AdminIncident, FeatureFlag
from app.models.bots import BotEvent
from app.models.user import User


async def flags(db: AsyncSession) -> list[tuple[FeatureFlag, str | None]]:
    rows = await db.execute(
        select(FeatureFlag, User.username)
        .outerjoin(User, User.id == FeatureFlag.updated_by)
        .order_by(FeatureFlag.environment, FeatureFlag.key)
    )
    return [(row[0], row[1]) for row in rows]


async def flag_for_update(db: AsyncSession, key: str, environment: str) -> FeatureFlag | None:
    return cast(
        FeatureFlag | None,
        await db.scalar(
            select(FeatureFlag)
            .where(FeatureFlag.key == key, FeatureFlag.environment == environment)
            .with_for_update()
        ),
    )


async def incidents(db: AsyncSession, limit: int = 50) -> list[tuple[AdminIncident, str | None]]:
    rows = await db.execute(
        select(AdminIncident, User.username)
        .outerjoin(User, User.id == AdminIncident.updated_by)
        .order_by(AdminIncident.started_at.desc(), AdminIncident.id.desc())
        .limit(limit)
    )
    return [(row[0], row[1]) for row in rows]


async def incident_for_update(db: AsyncSession, incident_id: UUID) -> AdminIncident | None:
    return cast(
        AdminIncident | None,
        await db.scalar(
            select(AdminIncident).where(AdminIncident.id == incident_id).with_for_update()
        ),
    )


async def failed_bot_events(db: AsyncSession, platform: str) -> int:
    return int(
        (
            await db.scalar(
                select(func.count(BotEvent.id)).where(
                    BotEvent.platform == platform, BotEvent.status == "failed"
                )
            )
        )
        or 0
    )
