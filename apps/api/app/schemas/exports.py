"""Публичное состояние полного экспорта аккаунта."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.models.exports import AccountExportStatus


class AccountExportPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    status: AccountExportStatus
    progress: int
    size_bytes: int | None
    error_message: str | None
    created_at: datetime
    finished_at: datetime | None
    expires_at: datetime | None
    download_url: str | None = None
