"""Безопасные контракты фоновых операций для административной панели."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

AdminJobKind = Literal["import", "export", "transcription", "media", "search"]


class AdminJobItem(BaseModel):
    id: UUID
    kind: AdminJobKind
    status: str
    user_id: UUID | None
    username: str | None
    email: str | None
    label: str
    progress: int | None
    error: str | None
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
    retryable: bool
    stale: bool


class AdminJobList(BaseModel):
    items: list[AdminJobItem]
    total: int
    offset: int
    limit: int


class AdminJobRetry(BaseModel):
    reason: str = Field(min_length=10, max_length=500)
