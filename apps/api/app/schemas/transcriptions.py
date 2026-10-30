from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.transcriptions import TranscriptionProvider, TranscriptionStatus


class TranscriptionCreate(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    content_type: str = Field(default="application/octet-stream", max_length=120)
    size_bytes: int = Field(gt=0, le=1024 * 1024 * 1024)
    total_parts: int = Field(gt=0, le=64)
    provider: TranscriptionProvider = TranscriptionProvider.faster_whisper
    language: str | None = Field(default=None, max_length=12)
    beam_size: int = Field(default=5, ge=1, le=10)
    vad_filter: bool = True
    word_timestamps: bool = False


class TranscriptionPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    filename: str
    title: str | None
    size_bytes: int
    duration_seconds: int | None
    total_parts: int
    uploaded_parts: int
    status: TranscriptionStatus
    provider: TranscriptionProvider
    fast_mode: bool
    phrase_timestamps: bool
    speaker_labeling: bool
    quota_minutes: int | None
    has_structured_result: bool
    result_text: str | None
    error_message: str | None
    upload_expires_at: datetime | None
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None


class UserTranscriptionCreate(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    content_type: str = Field(default="application/octet-stream", max_length=120)
    size_bytes: int = Field(gt=0, le=1024 * 1024 * 1024)
    total_parts: int = Field(gt=0, le=64)
    duration_seconds: int = Field(gt=0, le=4 * 60 * 60)
    language: str | None = Field(default="ru", max_length=12)
    fast_mode: bool = False
    phrase_timestamps: bool = False
    speaker_labeling: bool = False


class TranscriptionStructuredResult(BaseModel):
    provider: TranscriptionProvider
    data: dict[str, Any]


class TranscriptionUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    result_text: str | None = Field(default=None, max_length=5_000_000)


class TranscriptionUploadPartsRequest(BaseModel):
    part_numbers: list[int] = Field(min_length=1, max_length=10)


class TranscriptionUploadPartUrl(BaseModel):
    part_number: int
    url: str


class TranscriptionUploadedPart(BaseModel):
    part_number: int
    size_bytes: int


class TranscriptionUploadState(BaseModel):
    part_size_bytes: int
    total_parts: int
    uploaded_parts: list[TranscriptionUploadedPart]
    expires_at: datetime
