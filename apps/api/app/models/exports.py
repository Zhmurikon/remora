"""Долговечные задания полного экспорта аккаунта."""

import enum
from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, Enum, ForeignKey, Index, Integer, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class AccountExportStatus(enum.Enum):
    queued = "queued"
    processing = "processing"
    completed = "completed"
    failed = "failed"


class AccountExportJob(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "account_export_jobs"
    __table_args__ = (
        Index("ix_account_export_jobs_user_id_created_at", "user_id", "created_at"),
        Index("ix_account_export_jobs_status_created_at", "status", "created_at"),
    )

    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    status: Mapped[AccountExportStatus] = mapped_column(
        Enum(AccountExportStatus),
        default=AccountExportStatus.queued,
        server_default=text("'queued'"),
    )
    progress: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"))
    storage_key: Mapped[str | None] = mapped_column(String(500), unique=True)
    size_bytes: Mapped[int | None]
    error_message: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
