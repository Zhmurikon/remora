from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.transcriptions import TranscriptionStatus


class TranscriptionCreate(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    content_type: str = Field(default="application/octet-stream", max_length=120)
    size_bytes: int = Field(gt=0, le=1024 * 1024 * 1024)
    total_parts: int = Field(gt=0, le=64)
    language: str | None = Field(default=None, max_length=12)
    beam_size: int = Field(default=5, ge=1, le=10)
    vad_filter: bool = True
    word_timestamps: bool = False


class TranscriptionPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    filename: str
    size_bytes: int
    total_parts: int
    uploaded_parts: int
    status: TranscriptionStatus
    result_text: str | None
    error_message: str | None
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None

