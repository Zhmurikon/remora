"""Модели пользовательских наборов и карточек."""

from __future__ import annotations

import enum
from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, Enum, ForeignKey, Index, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class SetVisibility(enum.Enum):
    private = "private"
    unlisted = "unlisted"
    public = "public"


class ContentType(enum.Enum):
    text = "text"
    latex = "latex"
    code = "code"


class StudySet(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "study_sets"
    __table_args__ = (Index("ix_study_sets_owner_id_deleted_at", "owner_id", "deleted_at"),)

    owner_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text, default="", server_default=text("''"))
    visibility: Mapped[SetVisibility] = mapped_column(
        Enum(SetVisibility), default=SetVisibility.private, server_default=text("'private'")
    )
    slug: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    lang_term: Mapped[str] = mapped_column(String(10), default="ru", server_default=text("'ru'"))
    lang_definition: Mapped[str] = mapped_column(
        String(10), default="ru", server_default=text("'ru'")
    )
    cards_count: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"))
    copied_from_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("study_sets.id", ondelete="SET NULL")
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)

    cards: Mapped[list[Card]] = relationship(
        back_populates="study_set", cascade="all, delete-orphan", order_by="Card.position"
    )


class Card(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "cards"
    __table_args__ = (Index("ix_cards_set_id_position", "set_id", "position", unique=True),)

    set_id: Mapped[UUID] = mapped_column(
        ForeignKey("study_sets.id", ondelete="CASCADE"), index=True
    )
    position: Mapped[int] = mapped_column(Integer)
    term: Mapped[str] = mapped_column(Text)
    definition: Mapped[str] = mapped_column(Text)
    term_transcription: Mapped[str | None] = mapped_column(String(300))
    definition_transcription: Mapped[str | None] = mapped_column(String(300))
    hint: Mapped[str | None] = mapped_column(String(1000))
    content_type: Mapped[ContentType] = mapped_column(
        Enum(ContentType), default=ContentType.text, server_default=text("'text'")
    )
    code_language: Mapped[str | None] = mapped_column(String(50))
    alt_answers: Mapped[list[str]] = mapped_column(
        JSONB, default=list, server_default=text("'[]'::jsonb")
    )

    study_set: Mapped[StudySet] = relationship(back_populates="cards")
