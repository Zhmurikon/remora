"""Контракт скачиваемых вложений курса и статьи."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class AttachmentUploadRequest(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    mime: str = Field(default="application/octet-stream", min_length=1, max_length=255)
    size_bytes: int = Field(gt=0)
    article_id: UUID | None = None

    @field_validator("filename")
    @classmethod
    def safe_filename(cls, value: str) -> str:
        value = value.strip()
        if not value or any(ord(char) < 32 for char in value) or "/" in value or "\\" in value:
            raise ValueError("Имя файла не должно содержать путь или управляющие символы")
        return value


class AttachmentUploadTicket(BaseModel):
    id: UUID
    upload_url: str
    method: str = "PUT"
    headers: dict[str, str]
    expires_in: int


class CourseAttachmentPublic(BaseModel):
    id: UUID
    article_id: UUID | None
    filename: str
    mime: str
    size_bytes: int
    created_at: datetime


class AttachmentDownload(BaseModel):
    url: str
    expires_in: int
