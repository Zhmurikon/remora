"""Модели синхронной битвы двух пользователей по одному набору."""

from __future__ import annotations

import enum
from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.study import StudyDirection


class BattleStatus(enum.Enum):
    waiting = "waiting"
    countdown = "countdown"
    active = "active"
    finished = "finished"
    cancelled = "cancelled"
    expired = "expired"


class BattleFinishReason(enum.Enum):
    completed = "completed"
    timeout = "timeout"


class Battle(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Комната и неизменяемый снимок вопросов одной битвы."""

    __tablename__ = "battles"
    __table_args__ = (
        UniqueConstraint("creator_id", "request_key", name="uq_battles_creator_request_key"),
        Index("ix_battles_set_id_created_at", "set_id", "created_at"),
        CheckConstraint("question_count BETWEEN 4 AND 20", name="question_count_range"),
    )

    creator_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    set_id: Mapped[UUID] = mapped_column(
        ForeignKey("study_sets.id", ondelete="CASCADE"), index=True
    )
    request_key: Mapped[UUID] = mapped_column()
    status: Mapped[BattleStatus] = mapped_column(
        Enum(BattleStatus), default=BattleStatus.waiting, server_default=text("'waiting'")
    )
    direction: Mapped[StudyDirection] = mapped_column(Enum(StudyDirection))
    question_count: Mapped[int] = mapped_column(Integer)
    questions: Mapped[list[dict[str, Any]]] = mapped_column(JSONB)
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deadline_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    winner_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    finish_reason: Mapped[BattleFinishReason | None] = mapped_column(Enum(BattleFinishReason))
    rematch_of_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("battles.id", ondelete="SET NULL"), index=True
    )


class BattleParticipant(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "battle_participants"
    __table_args__ = (
        UniqueConstraint("battle_id", "user_id", name="uq_battle_participants_battle_user"),
        UniqueConstraint("battle_id", "slot", name="uq_battle_participants_battle_slot"),
        CheckConstraint("slot BETWEEN 1 AND 2", name="slot_range"),
    )

    battle_id: Mapped[UUID] = mapped_column(
        ForeignKey("battles.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    slot: Mapped[int] = mapped_column(Integer)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    ready_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    answered_count: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"))
    correct_count: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    duration_ms: Mapped[int | None] = mapped_column(Integer)
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class BattleAnswer(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "battle_answers"
    __table_args__ = (
        UniqueConstraint(
            "participant_id", "question_id", name="uq_battle_answers_participant_question"
        ),
        UniqueConstraint(
            "participant_id", "client_answer_id", name="uq_battle_answers_participant_client"
        ),
    )

    participant_id: Mapped[UUID] = mapped_column(
        ForeignKey("battle_participants.id", ondelete="CASCADE"), index=True
    )
    question_id: Mapped[str] = mapped_column(String(120))
    client_answer_id: Mapped[UUID] = mapped_column()
    value: Mapped[str] = mapped_column(String(4000))
    correct: Mapped[bool] = mapped_column()
    answered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
