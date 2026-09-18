"""Доступ к наборам и карточкам без бизнес-решений."""

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.content import Card, Folder, MediaAsset, StudySet
from app.models.courses import Course, CourseArticle, CourseSection
from app.models.user import User, UserStatus


async def get_media_asset(db: AsyncSession, asset_id: UUID) -> MediaAsset | None:
    return await db.get(MediaAsset, asset_id)


async def list_folders(db: AsyncSession, owner_id: UUID) -> list[Folder]:
    result = await db.scalars(
        select(Folder)
        .where(Folder.owner_id == owner_id)
        .order_by(Folder.position, Folder.created_at)
    )
    return list(result.all())


async def get_folder(db: AsyncSession, folder_id: UUID) -> Folder | None:
    return await db.get(Folder, folder_id)


async def next_folder_position(db: AsyncSession, owner_id: UUID) -> int:
    value = await db.scalar(
        select(func.coalesce(func.max(Folder.position), -1)).where(Folder.owner_id == owner_id)
    )
    return int(value or 0) + 1


async def delete_folder(db: AsyncSession, folder: Folder) -> None:
    await db.execute(update(StudySet).where(StudySet.folder_id == folder.id).values(folder_id=None))
    await db.execute(update(Folder).where(Folder.parent_id == folder.id).values(parent_id=None))
    await db.delete(folder)
    await db.flush()


async def list_sets(
    db: AsyncSession, owner_id: UUID, *, offset: int = 0, limit: int | None = None
) -> list[StudySet]:
    result = await db.scalars(
        select(StudySet)
        .where(StudySet.owner_id == owner_id, StudySet.deleted_at.is_(None))
        .order_by(StudySet.updated_at.desc(), StudySet.id)
        .offset(offset)
        .limit(limit)
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


async def get_public_set_by_slug(db: AsyncSession, slug: str) -> tuple[StudySet, User] | None:
    result = await db.execute(
        select(StudySet, User)
        .join(User, User.id == StudySet.owner_id)
        .join(CourseArticle, CourseArticle.set_id == StudySet.id)
        .join(CourseSection, CourseSection.id == CourseArticle.section_id)
        .join(Course, Course.id == CourseSection.course_id)
        .where(
            StudySet.slug == slug,
            StudySet.deleted_at.is_(None),
            Course.is_published.is_(True),
            Course.moderation_status != "blocked",
            Course.owner_id == StudySet.owner_id,
            User.status == UserStatus.active,
            User.deleted_at.is_(None),
        )
    )
    row = result.one_or_none()
    return (row[0], row[1]) if row is not None else None


async def public_cards_page(db: AsyncSession, set_id: UUID, after: int | None) -> list[Card]:
    query = select(Card).where(Card.set_id == set_id)
    if after is not None:
        query = query.where(Card.position > after)
    return list((await db.scalars(query.order_by(Card.position).limit(51))).all())


async def get_media_assets(db: AsyncSession, asset_ids: set[UUID]) -> list[MediaAsset]:
    if not asset_ids:
        return []
    result = await db.scalars(select(MediaAsset).where(MediaAsset.id.in_(asset_ids)))
    return list(result.all())


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
