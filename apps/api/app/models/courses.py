"""Структура курса; набор остаётся самостоятельным ресурсом обучения."""

from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class Course(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "courses"
    __table_args__ = (
        CheckConstraint(
            "moderation_status IN ('pending', 'ok', 'blocked')", name="moderation_status"
        ),
    )

    owner_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text, default="", server_default=text("''"))
    slug: Mapped[str] = mapped_column(String(200), unique=True)
    is_published: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))
    is_listed: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"))
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    moderation_status: Mapped[str] = mapped_column(
        String(20), default="pending", server_default="pending"
    )
    tags: Mapped[list[str]] = mapped_column(
        ARRAY(String(60)), default=list, server_default=text("'{}'")
    )


class CourseSection(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "course_sections"
    __table_args__ = (UniqueConstraint("course_id", "position"),)

    course_id: Mapped[UUID] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(160))
    position: Mapped[int] = mapped_column(Integer)


class CourseArticle(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "course_articles"
    __table_args__ = (UniqueConstraint("section_id", "position"),)

    section_id: Mapped[UUID] = mapped_column(ForeignKey("course_sections.id", ondelete="CASCADE"))
    # Один набор принадлежит одной статье; это исключает неявные правки нескольких курсов.
    set_id: Mapped[UUID] = mapped_column(
        ForeignKey("study_sets.id", ondelete="RESTRICT"), unique=True
    )
    title: Mapped[str] = mapped_column(String(160))
    body: Mapped[str] = mapped_column(Text, default="", server_default=text("''"))
    position: Mapped[int] = mapped_column(Integer)


class CourseAttachment(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Скачиваемый файл курса или одной его статьи."""

    __tablename__ = "course_attachments"
    __table_args__ = (
        CheckConstraint("size_bytes > 0 AND size_bytes <= 104857600", name="size_range"),
        UniqueConstraint("s3_key"),
    )

    course_id: Mapped[UUID] = mapped_column(
        ForeignKey("courses.id", ondelete="CASCADE"), index=True
    )
    article_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("course_articles.id", ondelete="CASCADE"), index=True
    )
    filename: Mapped[str] = mapped_column(String(255))
    mime: Mapped[str] = mapped_column(String(255))
    size_bytes: Mapped[int] = mapped_column(BigInteger)
    s3_key: Mapped[str] = mapped_column(String(500))
    status: Mapped[str] = mapped_column(String(20), default="pending", server_default="pending")


class CourseLike(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Одна пользовательская оценка опубликованного курса."""

    __tablename__ = "course_likes"
    __table_args__ = (UniqueConstraint("course_id", "user_id"),)

    course_id: Mapped[UUID] = mapped_column(
        ForeignKey("courses.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)


class LibrarySave(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Связанный оригинал в библиотеке пользователя, без копирования содержимого."""

    __tablename__ = "library_saves"
    __table_args__ = (
        CheckConstraint(
            "num_nonnulls(course_id, article_id, set_id) = 1", name="exactly_one_target"
        ),
        UniqueConstraint("user_id", "course_id", name="uq_library_saves_user_course"),
        UniqueConstraint("user_id", "article_id", name="uq_library_saves_user_article"),
        UniqueConstraint("user_id", "set_id", name="uq_library_saves_user_set"),
    )

    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    course_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("courses.id", ondelete="CASCADE"), index=True
    )
    article_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("course_articles.id", ondelete="CASCADE"), index=True
    )
    set_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("study_sets.id", ondelete="CASCADE"), index=True
    )
    folder_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("folders.id", ondelete="SET NULL"), index=True
    )
    accepted_snapshot: Mapped[dict[str, Any]] = mapped_column(
        JSONB, default=dict, server_default=text("'{}'::jsonb")
    )
    accepted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )


class CourseSearchSync(Base):
    """Накопленная задача точечной пересборки одного документа каталога.

    Версия не позволяет воркеру потерять правку, пришедшую пока он отправлял
    предыдущую версию документа в Meilisearch.
    """

    __tablename__ = "course_search_sync"

    # В очереди остаётся ID уже удалённого курса: воркер должен удалить документ из поиска.
    course_id: Mapped[UUID] = mapped_column(primary_key=True)
    version: Mapped[int] = mapped_column(Integer, default=1, server_default=text("1"))
    requested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )
