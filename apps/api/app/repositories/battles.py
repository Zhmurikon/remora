"""Запросы к комнатам, участникам и ответам битв."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.battles import Battle, BattleAnswer, BattleParticipant
from app.models.content import StudySet
from app.models.user import User


async def lock_creator(db: AsyncSession, user_id: UUID) -> None:
    await db.execute(
        text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"),
        {"key": f"battle-create:{user_id}"},
    )


async def by_request_key(db: AsyncSession, creator_id: UUID, request_key: UUID) -> Battle | None:
    battle: Battle | None = await db.scalar(
        select(Battle).where(
            Battle.creator_id == creator_id,
            Battle.request_key == request_key,
        )
    )
    return battle


async def for_update(db: AsyncSession, battle_id: UUID) -> Battle | None:
    battle: Battle | None = await db.scalar(
        select(Battle).where(Battle.id == battle_id).with_for_update()
    )
    return battle


async def participants(db: AsyncSession, battle_id: UUID) -> list[BattleParticipant]:
    result = await db.scalars(
        select(BattleParticipant)
        .where(BattleParticipant.battle_id == battle_id)
        .order_by(BattleParticipant.slot)
    )
    return list(result.all())


async def participant(db: AsyncSession, battle_id: UUID, user_id: UUID) -> BattleParticipant | None:
    row: BattleParticipant | None = await db.scalar(
        select(BattleParticipant).where(
            BattleParticipant.battle_id == battle_id,
            BattleParticipant.user_id == user_id,
        )
    )
    return row


async def participant_users(
    db: AsyncSession, participant_rows: list[BattleParticipant]
) -> dict[UUID, User]:
    if not participant_rows:
        return {}
    result = await db.scalars(
        select(User).where(User.id.in_([item.user_id for item in participant_rows]))
    )
    return {user.id: user for user in result.all()}


async def set_for_battle(db: AsyncSession, set_id: UUID) -> StudySet | None:
    return await db.get(StudySet, set_id)


async def answers(db: AsyncSession, participant_id: UUID) -> list[BattleAnswer]:
    result = await db.scalars(
        select(BattleAnswer)
        .where(BattleAnswer.participant_id == participant_id)
        .order_by(BattleAnswer.answered_at)
    )
    return list(result.all())


async def answer_by_client_id(
    db: AsyncSession, participant_id: UUID, client_answer_id: UUID
) -> BattleAnswer | None:
    answer: BattleAnswer | None = await db.scalar(
        select(BattleAnswer).where(
            BattleAnswer.participant_id == participant_id,
            BattleAnswer.client_answer_id == client_answer_id,
        )
    )
    return answer


async def answer_by_question(
    db: AsyncSession, participant_id: UUID, question_id: str
) -> BattleAnswer | None:
    answer: BattleAnswer | None = await db.scalar(
        select(BattleAnswer).where(
            BattleAnswer.participant_id == participant_id,
            BattleAnswer.question_id == question_id,
        )
    )
    return answer


async def insert_answer(db: AsyncSession, values: dict[str, object]) -> bool:
    result = await db.execute(
        insert(BattleAnswer).values(**values).on_conflict_do_nothing().returning(BattleAnswer.id)
    )
    return result.scalar_one_or_none() is not None
