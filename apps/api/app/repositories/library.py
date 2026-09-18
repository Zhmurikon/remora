"""Запросы связанной библиотеки и вычисление доступа к обучению."""

from typing import Any, cast
from uuid import UUID

from sqlalchemy import delete, or_, select
from sqlalchemy.engine import CursorResult
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.content import Card, ContentType, StudySet
from app.models.courses import Course, CourseArticle, CourseSection, LibrarySave
from app.models.user import User, UserStatus


async def save_for_target(
    db: AsyncSession, user_id: UUID, target_type: str, target_id: UUID
) -> LibrarySave | None:
    column = {
        "course": LibrarySave.course_id,
        "article": LibrarySave.article_id,
        "set": LibrarySave.set_id,
    }[target_type]
    return (
        await db.scalars(
            select(LibrarySave).where(LibrarySave.user_id == user_id, column == target_id)
        )
    ).one_or_none()


async def remove_save(db: AsyncSession, user_id: UUID, save_id: UUID) -> bool:
    result = cast(
        CursorResult[tuple[object, ...]],
        await db.execute(
            delete(LibrarySave).where(
                LibrarySave.id == save_id, LibrarySave.user_id == user_id
            )
        ),
    )
    return bool(result.rowcount)


async def list_saves(db: AsyncSession, user_id: UUID) -> list[LibrarySave]:
    return list(
        (
            await db.scalars(
                select(LibrarySave)
                .where(LibrarySave.user_id == user_id)
                .order_by(LibrarySave.created_at.desc())
            )
        ).all()
    )


async def get_save(db: AsyncSession, user_id: UUID, save_id: UUID) -> LibrarySave | None:
    return (
        await db.scalars(
            select(LibrarySave).where(
                LibrarySave.id == save_id, LibrarySave.user_id == user_id
            )
        )
    ).one_or_none()


async def snapshot_for_set(
    db: AsyncSession, user_id: UUID, set_id: UUID
) -> dict[str, Any] | None:
    saves = await db.scalars(
        select(LibrarySave)
        .join(CourseArticle, CourseArticle.set_id == set_id)
        .join(CourseSection, CourseSection.id == CourseArticle.section_id)
        .where(
            LibrarySave.user_id == user_id,
            or_(
                LibrarySave.set_id == set_id,
                LibrarySave.article_id == CourseArticle.id,
                LibrarySave.course_id == CourseSection.course_id,
            ),
        )
        .order_by(
            LibrarySave.set_id.is_not(None).desc(),
            LibrarySave.article_id.is_not(None).desc(),
            LibrarySave.created_at.desc(),
        )
    )
    for saved in saves:
        for article in saved.accepted_snapshot.get("articles", []):
            if article.get("set", {}).get("id") == str(set_id):
                return cast(dict[str, Any], article["set"])
    return None


async def accepted_cards(
    db: AsyncSession, user_id: UUID, set_id: UUID, current: list[Card]
) -> list[Card]:
    snapshot = await snapshot_for_set(db, user_id, set_id)
    if snapshot is None:
        return current
    current_by_id = {str(card.id): card for card in current}
    result: list[Card] = []
    for value in snapshot.get("cards", []):
        stored = current_by_id.get(value["id"])
        if stored is None:
            continue
        result.append(
            Card(
                id=stored.id,
                set_id=set_id,
                position=value["position"],
                term=value["term"],
                definition=value["definition"],
                term_transcription=value.get("term_transcription"),
                definition_transcription=value.get("definition_transcription"),
                hint=value.get("hint"),
                content_type=ContentType(value["content_type"]),
                code_language=value.get("code_language"),
                term_image_id=stored.term_image_id,
                definition_image_id=stored.definition_image_id,
                alt_answers=value.get("alt_answers", []),
                wrong_term_answers=value.get("wrong_term_answers", []),
                wrong_definition_answers=value.get("wrong_definition_answers", []),
            )
        )
    return result


async def can_study_set(db: AsyncSession, user_id: UUID, set_id: UUID) -> bool:
    study_set = await db.get(StudySet, set_id)
    if study_set is None or study_set.deleted_at is not None:
        return False
    if study_set.owner_id == user_id:
        return True
    saved = await db.scalar(
        select(LibrarySave.id)
        .join(CourseArticle, CourseArticle.set_id == set_id)
        .join(CourseSection, CourseSection.id == CourseArticle.section_id)
        .join(Course, Course.id == CourseSection.course_id)
        .join(User, User.id == Course.owner_id)
        .where(
            LibrarySave.user_id == user_id,
            or_(
                LibrarySave.set_id == set_id,
                LibrarySave.article_id == CourseArticle.id,
                LibrarySave.course_id == Course.id,
            ),
            Course.is_published.is_(True),
            Course.moderation_status != "blocked",
            Course.owner_id == study_set.owner_id,
            User.status == UserStatus.active,
            User.deleted_at.is_(None),
        )
    )
    return saved is not None


async def cards_accessible_by(
    db: AsyncSession, user_id: UUID, card_ids: list[UUID]
) -> dict[UUID, Card]:
    if not card_ids:
        return {}
    cards = list((await db.scalars(select(Card).where(Card.id.in_(card_ids)))).all())
    allowed_sets = {
        card.set_id for card in cards if await can_study_set(db, user_id, card.set_id)
    }
    return {card.id: card for card in cards if card.set_id in allowed_sets}
