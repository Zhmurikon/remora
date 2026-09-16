"""Схемы импорта учебных материалов."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.imports import ImportJobStatus


class AnkiImportResult(BaseModel):
    imported_cards: int
    imported_images: int
    skipped_notes: int
    skipped_media: int
    warnings: list[str]
    errors: list[ImportErrorItem] = Field(default_factory=list)


class ImportErrorItem(BaseModel):
    row: int | None = None
    message: str


class ImportJobPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    set_id: UUID
    filename: str
    status: ImportJobStatus
    progress: int
    result: dict[str, object] | None
    errors: list[ImportErrorItem]
    error_message: str | None
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
