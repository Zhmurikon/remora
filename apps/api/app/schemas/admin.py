"""Контракты простой административной панели только для чтения."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class AdminOverview(BaseModel):
    generated_at: datetime
    users_total: int
    users_new_7d: int
    users_active_7d: int
    reviews_7d: int
    sets_total: int
    courses_total: int
    courses_published: int
    reports_open: int


class AdminUserItem(BaseModel):
    id: UUID
    email: str | None
    username: str
    display_name: str | None
    role: str
    status: str
    email_verified: bool
    created_at: datetime
    last_active_at: datetime | None
    sets_count: int
    courses_count: int
    reviews_count: int


class AdminUserList(BaseModel):
    items: list[AdminUserItem]
    total: int
    offset: int
    limit: int
