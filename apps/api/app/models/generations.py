"""Снимки входов, результаты и себестоимость учебной генерации."""

from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, true
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.courses import CourseArticle


class GenerationJob(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "generation_jobs"
    __table_args__ = (UniqueConstraint("user_id", "request_id"),)

    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    transcription_id: Mapped[UUID] = mapped_column(
        ForeignKey("transcription_jobs.id", ondelete="CASCADE"), index=True
    )
    request_id: Mapped[UUID]
    is_public: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())
    kind: Mapped[str] = mapped_column(String(16))
    status: Mapped[str] = mapped_column(String(16), default="queued", index=True)
    title: Mapped[str] = mapped_column(String(255))
    source_text: Mapped[str] = mapped_column(Text)
    source_hash: Mapped[str] = mapped_column(String(64))
    parent_id: Mapped[UUID | None] = mapped_column(ForeignKey("generation_jobs.id"))
    model: Mapped[str] = mapped_column(String(100))
    prompt_version: Mapped[str] = mapped_column(String(32))
    request_body: Mapped[dict[str, Any]] = mapped_column(JSONB)
    provider_response: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    markdown: Mapped[str | None] = mapped_column(Text)
    cards: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONB)
    error_message: Mapped[str | None] = mapped_column(Text)
    reserved_tokens: Mapped[int] = mapped_column(Integer)
    quota_period_key: Mapped[str] = mapped_column(String(10))
    quota_settled: Mapped[bool] = mapped_column(Boolean, default=False)
    input_tokens: Mapped[int | None] = mapped_column(Integer)
    output_tokens: Mapped[int | None] = mapped_column(Integer)
    estimated_cost_usd: Mapped[str | None] = mapped_column(String(32))
    saved_set_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("study_sets.id", ondelete="SET NULL")
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    article_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("course_articles.id", ondelete="SET NULL"), unique=True
    )
    course_id: Mapped[UUID | None] = mapped_column(ForeignKey("courses.id", ondelete="SET NULL"))
    linked_article: Mapped[CourseArticle | None] = relationship(lazy="selectin")
    edit_metadata: Mapped[dict[str, Any] | None] = mapped_column(JSONB)


class AssistantTask(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "assistant_tasks"
    __table_args__ = (UniqueConstraint("user_id", "request_id"), UniqueConstraint("source_id"))
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    request_id: Mapped[UUID]
    source_id: Mapped[UUID] = mapped_column(ForeignKey("transcription_jobs.id", ondelete="CASCADE"))
    source_ids: Mapped[list[str]] = mapped_column(JSONB)
    result: Mapped[str] = mapped_column(String(20))
    options: Mapped[dict[str, Any]] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(String(20), default="waiting", index=True)
    error_message: Mapped[str | None] = mapped_column(Text)
    note_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("generation_jobs.id", ondelete="SET NULL")
    )
    cards_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("generation_jobs.id", ondelete="SET NULL")
    )


class NoteRevision(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "note_revisions"
    note_id: Mapped[UUID] = mapped_column(
        ForeignKey("generation_jobs.id", ondelete="CASCADE"), index=True
    )
    markdown: Mapped[str] = mapped_column(Text)
