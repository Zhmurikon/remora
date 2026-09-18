"""Модели пользовательских наборов и карточек."""

from __future__ import annotations

import enum
from datetime import datetime
from uuid import UUID

from sqlalchemy import BigInteger, DateTime, Enum, ForeignKey, Index, Integer, String, Text, text
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


class MediaKind(enum.Enum):
    image = "image"
    audio = "audio"


class MediaSource(enum.Enum):
    upload = "upload"
    tts = "tts"


class MediaStatus(enum.Enum):
    pending = "pending"
    ready = "ready"
    rejected = "rejected"


class MediaAsset(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "media_assets"
    __table_args__ = (
        Index("ix_media_assets_owner_id_kind_status", "owner_id", "kind", "status"),
        Index("ix_media_assets_owner_id_checksum", "owner_id", "checksum"),
    )

    # Аудио из TTS принадлежит платформе, а не пользователю: кэш общий, и
    # удаление аккаунта не должно уносить озвучку, которой пользуются все.
    owner_id: Mapped[UUID | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    kind: Mapped[MediaKind] = mapped_column(Enum(MediaKind))
    s3_key: Mapped[str] = mapped_column(String(500), unique=True)
    mime: Mapped[str] = mapped_column(String(100))
    size_bytes: Mapped[int] = mapped_column(BigInteger)
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    duration_ms: Mapped[int | None] = mapped_column(Integer)
    checksum: Mapped[str | None] = mapped_column(String(64))
    source: Mapped[MediaSource] = mapped_column(
        Enum(MediaSource), default=MediaSource.upload, server_default=text("'upload'")
    )
    status: Mapped[MediaStatus] = mapped_column(
        Enum(MediaStatus), default=MediaStatus.pending, server_default=text("'pending'")
    )


class Folder(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "folders"
    __table_args__ = (
        Index("ix_folders_owner_id_parent_id_position", "owner_id", "parent_id", "position"),
    )

    owner_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    parent_id: Mapped[UUID | None] = mapped_column(ForeignKey("folders.id", ondelete="SET NULL"))
    title: Mapped[str] = mapped_column(String(100))
    color: Mapped[str] = mapped_column(String(30), default="lime", server_default=text("'lime'"))
    position: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"))


class StudySet(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "study_sets"
    __table_args__ = (Index("ix_study_sets_owner_id_deleted_at", "owner_id", "deleted_at"),)

    owner_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    folder_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("folders.id", ondelete="SET NULL"), index=True
    )
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
    term_image_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("media_assets.id", ondelete="SET NULL"), index=True
    )
    definition_image_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("media_assets.id", ondelete="SET NULL"), index=True
    )
    alt_answers: Mapped[list[str]] = mapped_column(
        JSONB, default=list, server_default=text("'[]'::jsonb")
    )
    wrong_term_answers: Mapped[list[str]] = mapped_column(
        JSONB, default=list, server_default=text("'[]'::jsonb")
    )
    wrong_definition_answers: Mapped[list[str]] = mapped_column(
        JSONB, default=list, server_default=text("'[]'::jsonb")
    )

    study_set: Mapped[StudySet] = relationship(back_populates="cards")
