"""Доступ к состояниям карточек, журналу ответов и сессиям."""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from datetime import datetime
from uuid import UUID

from sqlalchemy import Select, delete, func, or_, select, text, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.content import Card, StudySet
from app.models.study import (
    CardState,
    CardStateKind,
    Review,
    SessionStatus,
    StudyDirection,
    StudyMode,
    StudySession,
    TestAttempt,
    UserSetProgress,
)


async def lock_learning(db: AsyncSession, user_id: UUID) -> None:
    # Ответ и сброс не должны одновременно пересоздавать удалённое состояние FSRS.
    await db.execute(
        text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"),
        {"key": f"study:{user_id}"},
    )


async def reset_learning(db: AsyncSession, user_id: UUID, set_id: UUID, reset_at: datetime) -> None:
    await db.execute(
        delete(CardState).where(CardState.user_id == user_id, CardState.set_id == set_id)
    )
    await db.execute(
        update(StudySession)
        .where(
            StudySession.user_id == user_id,
            StudySession.set_id == set_id,
            StudySession.status == SessionStatus.active,
        )
        .values(
            status=SessionStatus.abandoned,
            ended_at=reset_at,
            config=StudySession.config.op("||")({"progress_reset": True}),
        )
    )
    # Старую попытку можно закончить для истории, но не вернуть ею прежнее расписание.
    await db.execute(
        update(TestAttempt)
        .where(
            TestAttempt.user_id == user_id,
            TestAttempt.set_id == set_id,
            TestAttempt.finished_at.is_(None),
        )
        .values(config=TestAttempt.config.op("||")({"write_to_schedule": False}))
    )


async def reset_times(db: AsyncSession, user_id: UUID, set_ids: set[UUID]) -> dict[UUID, datetime]:
    rows = await db.execute(
        select(UserSetProgress.set_id, UserSetProgress.reset_at).where(
            UserSetProgress.user_id == user_id,
            UserSetProgress.set_id.in_(set_ids),
            UserSetProgress.reset_at.is_not(None),
        )
    )
    return {set_id: reset_at for set_id, reset_at in rows if reset_at is not None}


async def list_states_for_set(db: AsyncSession, user_id: UUID, set_id: UUID) -> list[CardState]:
    result = await db.scalars(
        select(CardState).where(CardState.user_id == user_id, CardState.set_id == set_id)
    )
    return list(result.all())


async def get_states(
    db: AsyncSession, user_id: UUID, keys: Iterable[tuple[UUID, StudyDirection]]
) -> list[CardState]:
    pairs = list(keys)
    if not pairs:
        return []
    result = await db.scalars(
        select(CardState).where(
            CardState.user_id == user_id,
            CardState.card_id.in_({card_id for card_id, _ in pairs}),
        )
    )
    wanted = set(pairs)
    return [state for state in result.all() if (state.card_id, state.direction) in wanted]


async def count_reviews_since(db: AsyncSession, user_id: UUID, since: datetime) -> int:
    value = await db.scalar(
        select(func.count())
        .select_from(Review)
        .outerjoin(
            UserSetProgress,
            (UserSetProgress.user_id == Review.user_id) & (UserSetProgress.set_id == Review.set_id),
        )
        .where(
            Review.user_id == user_id,
            Review.reviewed_at >= since,
            or_(UserSetProgress.reset_at.is_(None), Review.reviewed_at > UserSetProgress.reset_at),
        )
    )
    return int(value or 0)


async def count_new_cards_since(db: AsyncSession, user_id: UUID, since: datetime) -> int:
    """Сколько новых карточек пользователь начал сегодня.

    Считаем по журналу, а не по `card_states`: состояние создаётся при первом
    ответе, но потом оно перестаёт быть новым, и восстановить факт «начал
    сегодня» можно только из `state_before`.
    """
    value = await db.scalar(
        select(func.count(func.distinct(Review.card_id)))
        .outerjoin(
            UserSetProgress,
            (UserSetProgress.user_id == Review.user_id) & (UserSetProgress.set_id == Review.set_id),
        )
        .where(
            Review.user_id == user_id,
            Review.reviewed_at >= since,
            Review.state_before["state"].astext == CardStateKind.new.value,
            or_(UserSetProgress.reset_at.is_(None), Review.reviewed_at > UserSetProgress.reset_at),
        )
    )
    return int(value or 0)


async def find_existing_client_review_ids(
    db: AsyncSession, user_id: UUID, client_review_ids: Sequence[UUID]
) -> set[UUID]:
    if not client_review_ids:
        return set()
    result = await db.scalars(
        select(Review.client_review_id).where(
            Review.user_id == user_id, Review.client_review_id.in_(client_review_ids)
        )
    )
    return set(result.all())


async def insert_review(db: AsyncSession, values: dict[str, object]) -> bool:
    """Пишет ответ в журнал. `False` — такой `client_review_id` уже принят.

    Уникальный индекс, а не предварительная проверка: два параллельных ретрая
    одного батча не должны создать две записи.
    """
    statement = (
        insert(Review)
        .values(**values)
        .on_conflict_do_nothing(constraint="uq_reviews_user_id_client_review_id")
        .returning(Review.id)
    )
    result = await db.execute(statement)
    return result.scalar_one_or_none() is not None


async def cards_owned_by(
    db: AsyncSession, user_id: UUID, card_ids: Sequence[UUID]
) -> dict[UUID, Card]:
    """Карточки из наборов пользователя. Чужие в выдачу не попадают."""
    if not card_ids:
        return {}
    result = await db.execute(
        select(Card)
        .join(StudySet, StudySet.id == Card.set_id)
        .where(
            Card.id.in_(card_ids),
            StudySet.owner_id == user_id,
            StudySet.deleted_at.is_(None),
        )
    )
    return {card.id: card for card in result.scalars().all()}


async def get_session(db: AsyncSession, session_id: UUID) -> StudySession | None:
    return await db.get(StudySession, session_id)


async def get_active_session(
    db: AsyncSession, user_id: UUID, set_id: UUID, mode: StudyMode | None = None
) -> StudySession | None:
    query = (
        select(StudySession)
        .where(
            StudySession.user_id == user_id,
            StudySession.set_id == set_id,
            StudySession.status == SessionStatus.active,
        )
        .order_by(StudySession.started_at.desc())
        .limit(1)
    )
    if mode is not None:
        query = query.where(StudySession.mode == mode)
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def get_progress(db: AsyncSession, user_id: UUID, set_id: UUID) -> UserSetProgress | None:
    result = await db.execute(
        select(UserSetProgress).where(
            UserSetProgress.user_id == user_id, UserSetProgress.set_id == set_id
        )
    )
    return result.scalar_one_or_none()


async def forecast_due_counts(
    db: AsyncSession, user_id: UUID, until: datetime, set_id: UUID | None = None
) -> list[tuple[datetime, int]]:
    """Сколько карточек к повторению по дням до указанного момента."""
    day = func.date_trunc("day", func.timezone("UTC", CardState.due_at))
    query: Select[tuple[datetime, int]] = (
        select(day, func.count())
        .where(
            CardState.user_id == user_id,
            CardState.suspended_at.is_(None),
            CardState.state != CardStateKind.new,
            CardState.due_at < until,
        )
        .group_by(day)
        .order_by(day)
    )
    if set_id is not None:
        query = query.where(CardState.set_id == set_id)
    result = await db.execute(query)
    return [(row[0], int(row[1])) for row in result.all()]
