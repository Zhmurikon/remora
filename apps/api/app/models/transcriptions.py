"""Долговечные задания закрытого инструмента расшифровки."""

import enum
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, Enum, Integer, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class TranscriptionStatus(enum.Enum):
    uploading = "uploading"
    queued = "queued"
    converting = "converting"
    transcribing = "transcribing"
    completed = "completed"
    failed = "failed"


class TranscriptionJob(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "transcription_jobs"

    filename: Mapped[str] = mapped_column(String(255))
    content_type: Mapped[str] = mapped_column(String(120))
    size_bytes: Mapped[int] = mapped_column(BigInteger)
    total_parts: Mapped[int] = mapped_column(Integer)
    uploaded_parts: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"))
    status: Mapped[TranscriptionStatus] = mapped_column(
        Enum(TranscriptionStatus),
        default=TranscriptionStatus.uploading,
        server_default=text("'uploading'"),
        index=True,
    )
    language: Mapped[str | None] = mapped_column(String(12))
    beam_size: Mapped[int] = mapped_column(Integer, default=5, server_default=text("5"))
    vad_filter: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"))
    word_timestamps: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=text("false")
    )
    result_text: Mapped[str | None] = mapped_column(Text)
    error_message: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

