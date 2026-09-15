"""Схемы загрузки и выдачи пользовательских медиа."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.content import MediaStatus


class ImageUploadRequest(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    mime: str = Field(max_length=100)
    size_bytes: int = Field(gt=0)


class ImageUploadTicket(BaseModel):
    id: UUID
    upload_url: str
    method: str = "PUT"
    headers: dict[str, str]
    expires_in: int


class MediaAssetPublic(BaseModel):
    id: UUID
    mime: str
    size_bytes: int
    width: int | None
    height: int | None
    status: MediaStatus
    download_url: str | None
    created_at: datetime
