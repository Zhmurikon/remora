"""Модели движка обучения: состояния FSRS, журнал ответов, сессии и прогресс.

`card_states` — самая горячая таблица продукта: её читает каждая выборка очереди
и пишет каждый ответ. Поэтому набор денормализован в саму строку (`set_id`),
а индексы заточены под два запроса: «что просрочено у пользователя» и
«как обстоят дела с этим набором».
"""

from __future__ import annotations

import enum
from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    Float,
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


class StudyDirection(enum.Enum):
    """Направление изучения. Состояния FSRS по направлениям раздельные."""

    term_to_def = "term_to_def"
    def_to_term = "def_to_term"


class CardStateKind(enum.Enum):
    """Состояние карточки. `new` — строка создана, но ответов ещё не было."""

    new = "new"
    learning = "learning"
    review = "review"
    relearning = "relearning"


class StudyMode(enum.Enum):
    flashcards = "flashcards"
    learn = "learn"
    test = "test"
    write = "write"
    listen = "listen"


class SessionStatus(enum.Enum):
    active = "active"
    finished = "finished"
    abandoned = "abandoned"


class CardState(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Состояние FSRS для тройки (пользователь, карточка, направление).

    Создаётся лениво — при первом попадании карточки в очередь, а не при
    создании набора: иначе публичный набор на 500 карточек породил бы 1000
    пустых строк на каждого, кто его просто открыл.
    """

    __tablename__ = "card_states"
    __table_args__ = (
        UniqueConstraint(
            "user_id", "card_id", "direction", name="uq_card_states_user_id_card_id_direction"
        ),
        # Выборка очереди: только неотложенные карточки, отсортированные по сроку.
        Index(
            "ix_card_states_user_id_due_at_active",
            "user_id",
            "due_at",
            postgresql_where=text("suspended_at IS NULL"),
        ),
        Index("ix_card_states_user_id_set_id_state", "user_id", "set_id", "state"),
    )

    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    card_id: Mapped[UUID] = mapped_column(ForeignKey("cards.id", ondelete="CASCADE"), index=True)
    set_id: Mapped[UUID] = mapped_column(
        ForeignKey("study_sets.id", ondelete="CASCADE"), index=True
    )
    direction: Mapped[StudyDirection] = mapped_column(Enum(StudyDirection))
    state: Mapped[CardStateKind] = mapped_column(
        Enum(CardStateKind), default=CardStateKind.new, server_default=text("'new'")
    )
    stability: Mapped[float | None] = mapped_column(Float)
    difficulty: Mapped[float | None] = mapped_column(Float)
    step: Mapped[int | None] = mapped_column(Integer)
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reps: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"))
    lapses: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"))
    elapsed_days: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"))
    scheduled_days: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"))
    suspended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    scheduler_version: Mapped[str] = mapped_column(String(32))


class Review(UUIDPrimaryKeyMixin, Base):
    """Иммутабельный журнал ответов: основа аналитики и переоптимизации FSRS.

    `client_review_id` генерирует клиент, он же делает повторную отправку
    безопасной: уникальность по (пользователь, client_review_id) превращает
    ретрай после обрыва сети в no-op.
    """

    __tablename__ = "reviews"
    __table_args__ = (
        UniqueConstraint("user_id", "client_review_id", name="uq_reviews_user_id_client_review_id"),
        CheckConstraint("rating BETWEEN 1 AND 4", name="rating_range"),
        Index("ix_reviews_user_id_reviewed_at", "user_id", "reviewed_at"),
        Index("ix_reviews_card_id_direction", "card_id", "direction"),
    )

    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    card_id: Mapped[UUID] = mapped_column(ForeignKey("cards.id", ondelete="CASCADE"))
    set_id: Mapped[UUID] = mapped_column(ForeignKey("study_sets.id", ondelete="CASCADE"))
    direction: Mapped[StudyDirection] = mapped_column(Enum(StudyDirection))
    session_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("study_sessions.id", ondelete="SET NULL"), index=True
    )
    client_review_id: Mapped[UUID] = mapped_column()
    mode: Mapped[StudyMode] = mapped_column(Enum(StudyMode))
    rating: Mapped[int] = mapped_column(Integer)
    answer_correct: Mapped[bool | None] = mapped_column(Boolean)
    duration_ms: Mapped[int | None] = mapped_column(Integer)
    reviewed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    state_before: Mapped[dict[str, Any]] = mapped_column(
        JSONB, default=dict, server_default=text("'{}'::jsonb")
    )
    state_after: Mapped[dict[str, Any]] = mapped_column(
        JSONB, default=dict, server_default=text("'{}'::jsonb")
    )
    scheduler_version: Mapped[str] = mapped_column(String(32))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class StudySession(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Одна тренировка. Незавершённую сессию клиент восстанавливает при возврате."""

    __tablename__ = "study_sessions"
    __table_args__ = (
        Index("ix_study_sessions_user_id_set_id_status", "user_id", "set_id", "status"),
    )

    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    set_id: Mapped[UUID] = mapped_column(
        ForeignKey("study_sets.id", ondelete="CASCADE"), index=True
    )
    mode: Mapped[StudyMode] = mapped_column(Enum(StudyMode))
    status: Mapped[SessionStatus] = mapped_column(
        Enum(SessionStatus), default=SessionStatus.active, server_default=text("'active'")
    )
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cards_seen: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"))
    cards_correct: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"))
    config: Mapped[dict[str, Any]] = mapped_column(
        JSONB, default=dict, server_default=text("'{}'::jsonb")
    )


class TestAttempt(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Одна попытка теста с зафиксированным списком вопросов.

    Вопросы генерируются на сервере и не пересоздаются при перезагрузке
    страницы: иначе человек, обновивший вкладку, получил бы другой тест.
    Правильные ответы лежат здесь же и клиенту до проверки не уходят.
    """

    __tablename__ = "test_attempts"
    __table_args__ = (
        Index("ix_test_attempts_user_id_set_id_created_at", "user_id", "set_id", "created_at"),
    )

    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    set_id: Mapped[UUID] = mapped_column(
        ForeignKey("study_sets.id", ondelete="CASCADE"), index=True
    )
    session_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("study_sessions.id", ondelete="SET NULL")
    )
    config: Mapped[dict[str, Any]] = mapped_column(
        JSONB, default=dict, server_default=text("'{}'::jsonb")
    )
    questions: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, default=list, server_default=text("'[]'::jsonb")
    )
    answers: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, default=list, server_default=text("'[]'::jsonb")
    )
    score: Mapped[float | None] = mapped_column(Float)
    correct_count: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Попытка, ошибки которой пересдаются. Нужна, чтобы показать цепочку пересдач.
    retake_of_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("test_attempts.id", ondelete="SET NULL")
    )


class UserSetProgress(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Денормализованная сводка по набору. Пересчитывается при завершении сессии."""

    __tablename__ = "user_set_progress"
    __table_args__ = (
        UniqueConstraint("user_id", "set_id", name="uq_user_set_progress_user_id_set_id"),
    )

    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    set_id: Mapped[UUID] = mapped_column(
        ForeignKey("study_sets.id", ondelete="CASCADE"), index=True
    )
    mastered_count: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"))
    learning_count: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"))
    not_started_count: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"))
    mastery_percent: Mapped[float] = mapped_column(Float, default=0.0, server_default=text("0"))
    last_studied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reset_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
