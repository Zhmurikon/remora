"""Редакционные публикации блога, управляемые администраторами и ИИ-агентами."""

from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Integer, String, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class BlogPost(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "blog_posts"

    author_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    slug: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    status: Mapped[str] = mapped_column(
        String(16), index=True, default="draft", server_default="draft"
    )
    title: Mapped[str] = mapped_column(String(180))
    description: Mapped[str] = mapped_column(String(500))
    category: Mapped[str] = mapped_column(String(80), index=True)
    content: Mapped[dict[str, Any]] = mapped_column(
        JSONB, default=dict, server_default=text("'{}'::jsonb")
    )
    revision: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
