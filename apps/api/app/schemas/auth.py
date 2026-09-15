"""Pydantic-схемы запросов и ответов для аутентификации."""

from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    username: str = Field(min_length=3, max_length=32, pattern=r"^[a-zA-Z0-9_-]+$")
    birth_date: date | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserPublic


class RefreshResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class VerifyEmailRequest(BaseModel):
    token: str


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirmRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)


class ProfileUpdateRequest(BaseModel):
    username: str = Field(min_length=3, max_length=32, pattern=r"^[a-zA-Z0-9_-]+$")
    display_name: str | None = Field(default=None, max_length=64)
    locale: str = Field(min_length=2, max_length=5)
    timezone: str = Field(min_length=1, max_length=40)


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class SessionPublic(BaseModel):
    id: UUID
    user_agent: str | None
    ip: str | None
    expires_at: datetime
    current: bool


class UserPublic(BaseModel):
    id: UUID
    email: str | None
    username: str
    display_name: str | None
    avatar_url: str | None
    role: str
    email_verified: bool
    birth_date: date | None
    locale: str
    timezone: str


class UserSettingsResponse(BaseModel):
    daily_goal_cards: int
    fsrs_desired_retention: float
    fsrs_max_interval_days: int
    new_cards_per_day: int
    reviews_per_day: int
    theme: str
