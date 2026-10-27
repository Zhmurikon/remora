"""Контракты входа, 2FA и аудита административной панели."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field

from app.schemas.auth import UserPublic


class AdminLoginRequest(BaseModel):
    email: EmailStr
    password: str


class AdminLoginStep(BaseModel):
    step: Literal["setup_required", "challenge_required"]
    token: str


class AdminSetupRequest(BaseModel):
    token: str


class AdminSetupResponse(BaseModel):
    secret: str
    provisioning_uri: str


class AdminCodeRequest(BaseModel):
    token: str
    code: str = Field(min_length=6, max_length=32)


class AdminSessionResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserPublic
    recovery_codes: list[str] = Field(default_factory=list)


class AdminSecurityStatus(BaseModel):
    enabled: bool
    enabled_at: datetime | None
    last_used_at: datetime | None
    recovery_codes_remaining: int


class AdminConfirmationRequest(BaseModel):
    code: str = Field(min_length=6, max_length=32)


class AdminConfirmationResponse(BaseModel):
    confirmation_token: str
    expires_at: datetime


class AdminAuditItem(BaseModel):
    id: UUID
    actor_user_id: UUID | None
    actor_username: str | None
    action: str
    outcome: str
    target_type: str | None
    target_id: UUID | None
    reason: str | None
    ip: str | None
    details: dict[str, object]
    created_at: datetime


class AdminAuditList(BaseModel):
    items: list[AdminAuditItem]
    total: int
    offset: int
    limit: int
