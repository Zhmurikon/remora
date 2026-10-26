"""Pydantic-схемы запросов и ответов для аутентификации."""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, model_validator

from app.core.legal import OFFER_VERSION, PDN_CONSENT_VERSION, requires_guardian_consent


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    username: str = Field(min_length=3, max_length=32, pattern=r"^[a-zA-Z0-9_-]+$")
    birth_date: date
    pdn_version: str = Field(max_length=16)
    offer_version: str = Field(max_length=16)
    guardian_email: EmailStr | None = None
    captcha_token: str | None = Field(default=None, max_length=4096)

    @model_validator(mode="after")
    def validate_legal_fields(self) -> RegisterRequest:
        if self.birth_date > date.today():
            raise ValueError("Дата рождения не может быть в будущем")
        if self.pdn_version != PDN_CONSENT_VERSION or self.offer_version != OFFER_VERSION:
            raise ValueError("Версия правовых документов устарела; обновите страницу")
        if requires_guardian_consent(self.birth_date) and self.guardian_email is None:
            raise ValueError("Для пользователя младше 14 лет нужен email законного представителя")
        if self.guardian_email is not None and self.guardian_email.lower() == self.email.lower():
            raise ValueError(
                "Email законного представителя должен отличаться от email пользователя"
            )
        return self


class GuardianConsentConfirmRequest(BaseModel):
    token: str = Field(min_length=32, max_length=256)


class LegalVersions(BaseModel):
    pdn: str = PDN_CONSENT_VERSION
    offer: str = OFFER_VERSION


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str | None = None
    token_type: str = "bearer"
    user: UserPublic


class RefreshRequest(BaseModel):
    refresh_token: str | None = None


class RefreshResponse(BaseModel):
    access_token: str
    refresh_token: str | None = None
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
    birth_date: date | None = None
    guardian_email: EmailStr | None = None

    @model_validator(mode="after")
    def validate_birth_date(self) -> ProfileUpdateRequest:
        if self.birth_date is not None and self.birth_date > date.today():
            raise ValueError("Дата рождения не может быть в будущем")
        return self


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class AccountDeletionRequest(BaseModel):
    password: str = Field(min_length=1, max_length=128)
    confirmation: Literal["УДАЛИТЬ"]
    public_content: Literal["delete", "archive_public"] = "delete"


class AccountDeletionResponse(BaseModel):
    scheduled_for: datetime


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
