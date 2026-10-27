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


class AdminUserMaterialItem(BaseModel):
    id: UUID
    kind: str
    title: str
    status: str
    items_count: int | None
    updated_at: datetime


class AdminUserMaterials(BaseModel):
    sets_total: int
    sets_archived: int
    cards_total: int
    courses_total: int
    courses_published: int
    recent: list[AdminUserMaterialItem]


class AdminUserActivity(BaseModel):
    reviews_total: int
    reviews_7d: int
    reviews_30d: int
    active_days_30d: int
    last_active_at: datetime | None


class AdminUserEntitlementOverride(BaseModel):
    key: str
    value: bool | int | str
    source: str
    reason: str
    starts_at: datetime
    valid_until: datetime | None


class AdminUserAccess(BaseModel):
    plan_code: str
    plan_name: str
    current_period_end: datetime | None
    cancel_at_period_end: bool
    features: dict[str, bool]
    limits: dict[str, int | None]
    usage: dict[str, int]
    remaining: dict[str, int | None]
    overrides: list[AdminUserEntitlementOverride]


class AdminUserPayment(BaseModel):
    id: UUID
    plan_code: str
    plan_name: str
    interval: str
    status: str
    amount: int
    discount_amount: int
    currency: str
    promo_code: str | None
    created_at: datetime
    paid_at: datetime | None


class AdminUserPromoRedemption(BaseModel):
    code: str
    kind: str
    value: int
    redeemed_at: datetime


class AdminUserReferral(BaseModel):
    code: str | None
    invited_by_username: str | None
    invited_total: int
    rewarded_total: int


class AdminUserDetail(BaseModel):
    id: UUID
    email: str | None
    username: str
    display_name: str | None
    role: str
    status: str
    email_verified: bool
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None
    locale: str
    timezone: str
    oauth_providers: list[str]
    materials: AdminUserMaterials
    activity: AdminUserActivity
    access: AdminUserAccess
    payments: list[AdminUserPayment]
    promo_redemptions: list[AdminUserPromoRedemption]
    referral: AdminUserReferral
