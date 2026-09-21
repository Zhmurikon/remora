"""Привязки мессенджеров и долговечный журнал доставки событий."""

from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, UUIDPrimaryKeyMixin


class BotLink(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "bot_links"
    __table_args__ = (
        UniqueConstraint("platform", "actor_id"),
        UniqueConstraint("user_id", "platform"),
    )
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    platform: Mapped[str] = mapped_column(String(16))
    actor_id: Mapped[str] = mapped_column(String(32))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class BotLinkCode(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "bot_link_codes"
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    platform: Mapped[str] = mapped_column(String(16))
    code_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class BotEvent(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "bot_events"
    __table_args__ = (
        UniqueConstraint("platform", "event_id"),
        Index("ix_bot_events_delivery", "platform", "status", "available_at"),
    )
    platform: Mapped[str] = mapped_column(String(16))
    event_id: Mapped[str] = mapped_column(String(128))
    actor_id: Mapped[str] = mapped_column(String(32))
    command: Mapped[str] = mapped_column(String(96))
    input: Mapped[str | None] = mapped_column(Text)
    code_hash: Mapped[str | None] = mapped_column(String(64))
    callback_id: Mapped[str | None] = mapped_column(String(128))
    message_id: Mapped[str | None] = mapped_column(String(64))
    reply: Mapped[str | None] = mapped_column(Text)
    reply_keyboard: Mapped[list[list[dict[str, str]]]] = mapped_column(
        JSONB, default=list, server_default=text("'[]'::jsonb")
    )
    audio_url: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16), default="pending")
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    lease_token: Mapped[UUID | None]
    available_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
