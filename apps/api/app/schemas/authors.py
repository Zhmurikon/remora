"""Публичный профиль автора без приватных данных аккаунта."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.schemas.search import CourseSearchItem


class AuthorStats(BaseModel):
    publications: int
    saves_received: int
    likes_received: int
    cards_studied: int
    current_streak_days: int


class AuthorProfile(BaseModel):
    id: UUID
    username: str
    display_name: str | None
    avatar_url: str | None
    joined_at: datetime
    stats: AuthorStats
    badges: list[str]
    courses: list[CourseSearchItem]
