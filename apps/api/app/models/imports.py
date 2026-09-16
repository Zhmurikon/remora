"""Состояние долговечных фоновых импортов."""

import enum
from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, Enum, ForeignKey, Index, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class ImportJobStatus(enum.Enum):
    queued = "queued"
    processing = "processing"
    completed = "completed"
    failed = "failed"


class ImportJob(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "import_jobs"
    __table_args__ = (
        Index("ix_import_jobs_user_id_created_at", "user_id", "created_at"),
        Index("ix_import_jobs_status_created_at", "status", "created_at"),
    )

    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    set_id: Mapped[UUID] = mapped_column(ForeignKey("study_sets.id", ondelete="CASCADE"))
    filename: Mapped[str] = mapped_column(String(255))
    storage_key: Mapped[str] = mapped_column(String(500), unique=True)
    status: Mapped[ImportJobStatus] = mapped_column(
        Enum(ImportJobStatus),
        default=ImportJobStatus.queued,
        server_default=text("'queued'"),
    )
    progress: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"))
    result: Mapped[dict[str, object] | None] = mapped_column(JSONB)
    errors: Mapped[list[dict[str, object]]] = mapped_column(
        JSONB, default=list, server_default=text("'[]'::jsonb")
    )
    error_message: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
