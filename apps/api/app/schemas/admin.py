from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class AdminSecondFactorStatus(BaseModel):
    configured: bool
    enabled: bool
    recovery_codes_left: int


class AdminSecondFactorSetup(BaseModel):
    password: str = Field(min_length=1, max_length=128)


class AdminSecondFactorSetupResult(BaseModel):
    secret: str
    provisioning_uri: str


class AdminSecondFactorVerify(BaseModel):
    code: str = Field(min_length=6, max_length=64)


class AdminSecondFactorEnabled(BaseModel):
    recovery_codes: list[str]
    admin_token: str


class AdminChallengeResult(BaseModel):
    admin_token: str


class AdminDashboard(BaseModel):
    users_total: int
    users_active: int
    users_suspended: int
    open_reports: int
    queued_jobs: int


class AdminUserItem(BaseModel):
    id: UUID
    email: str | None
    username: str
    role: str
    status: str
    email_verified: bool
    created_at: datetime


class AdminUserUpdate(BaseModel):
    role: Literal["user", "teacher", "moderator", "admin"] | None = None
    status: Literal["active", "suspended"] | None = None
    reason: str = Field(min_length=3, max_length=1000)


class AdminTaskItem(BaseModel):
    id: UUID
    kind: Literal["account_export", "import", "transcription"]
    status: str
    user_id: UUID | None
    progress: int
    created_at: datetime
    updated_at: datetime
