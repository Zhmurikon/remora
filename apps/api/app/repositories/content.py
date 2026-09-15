"""Доступ к наборам и карточкам без бизнес-решений."""

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.content import Card, StudySet


async def list_sets(db: AsyncSession, owner_id: UUID) -> list[StudySet]:
    result = await db.scalars(
        select(StudySet)
        .where(StudySet.owner_id == owner_id, StudySet.deleted_at.is_(None))
        .order_by(StudySet.updated_at.desc())
    )
    return list(result.all())


async def get_set(db: AsyncSession, set_id: UUID, *, with_cards: bool = False) -> StudySet | None:
    query = select(StudySet).where(StudySet.id == set_id, StudySet.deleted_at.is_(None))
    if with_cards:
        query = query.options(selectinload(StudySet.cards)).execution_options(
            populate_existing=True
        )
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def create_set(db: AsyncSession, study_set: StudySet) -> StudySet:
    db.add(study_set)
    await db.flush()
    return study_set


async def soft_delete_set(db: AsyncSession, study_set: StudySet) -> None:
    study_set.deleted_at = datetime.now(tz=UTC)
    await db.flush()


async def sync_cards(db: AsyncSession, study_set: StudySet, cards: list[Card]) -> None:
    existing = {card.id: card for card in study_set.cards}
    incoming_ids = {card.id for card in cards if card.id in existing}
    for card_id, card in existing.items():
        if card_id not in incoming_ids:
            await db.delete(card)
    await db.flush()
