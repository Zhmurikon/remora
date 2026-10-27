"""Безопасные контракты промокодов и реферальных начислений для админки."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


class AdminPromoCodeCreate(BaseModel):
    code: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]{1,47}$")
    kind: Literal["percent", "free_days"]
    value: int = Field(ge=1, le=3650)
    max_redemptions: int | None = Field(default=None, ge=1)
    starts_at: datetime
    ends_at: datetime | None = None
    reason: str = Field(min_length=10, max_length=500)

    @model_validator(mode="after")
    def validate_limits(self) -> "AdminPromoCodeCreate":
        if self.starts_at.tzinfo is None or (
            self.ends_at is not None and self.ends_at.tzinfo is None
        ):
            raise ValueError("Даты должны содержать часовой пояс")
        if self.kind == "percent" and self.value > 99:
            raise ValueError("Процент скидки не может превышать 99")
        if self.ends_at is not None and self.ends_at <= self.starts_at:
            raise ValueError("Дата завершения должна быть позже даты начала")
        return self


class AdminPromotionAction(BaseModel):
    reason: str = Field(min_length=10, max_length=500)


class AdminPromoCodeItem(BaseModel):
    id: UUID
    code: str
    kind: str
    value: int
    max_redemptions: int | None
    redemptions: int
    starts_at: datetime
    ends_at: datetime | None
    active: bool
    state: Literal["scheduled", "active", "expired", "disabled", "exhausted"]
    created_at: datetime


class AdminPromoCodeList(BaseModel):
    items: list[AdminPromoCodeItem]
    total: int
    offset: int
    limit: int


class AdminReferralItem(BaseModel):
    id: UUID
    code: str
    inviter_id: UUID
    inviter_username: str
    inviter_email: str | None
    invited_user_id: UUID
    invited_username: str
    invited_email: str | None
    status: str
    reward_days: int
    rewarded_at: datetime | None
    revoked_at: datetime | None
    invited_subscription_id: UUID | None
    inviter_subscription_id: UUID | None
    risk_signals: list[str]
    created_at: datetime


class AdminReferralList(BaseModel):
    items: list[AdminReferralItem]
    total: int
    offset: int
    limit: int
