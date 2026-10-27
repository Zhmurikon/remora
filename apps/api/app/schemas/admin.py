"""Контракты просмотра и управления пользователями в административной панели."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


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
    id: UUID
    key: str
    value: bool | int | str
    source: str
    reason: str
    starts_at: datetime
    valid_until: datetime | None
    revocable: bool


class AdminUserEntitlementHistoryItem(AdminUserEntitlementOverride):
    status: Literal["scheduled", "active", "expired"]
    created_at: datetime


class AdminEntitlementDecision(BaseModel):
    key: str
    kind: Literal["feature", "limit"]
    value: bool | int | Literal["unlimited"]
    source: Literal["override", "plan", "free"]
    source_label: str
    reason: str | None


class AdminUserDegradationLimit(BaseModel):
    key: str
    current: int
    projected_limit: int
    over_by: int


class AdminUserDegradationPreview(BaseModel):
    limit_impacts: list[AdminUserDegradationLimit]
    lost_features: list[str]
    guarantees: list[str]


class AdminUserAccess(BaseModel):
    plan_code: str
    plan_name: str
    plan_version: int
    current_period_end: datetime | None
    cancel_at_period_end: bool
    features: dict[str, bool]
    limits: dict[str, int | None]
    usage: dict[str, int]
    remaining: dict[str, int | None]
    overrides: list[AdminUserEntitlementOverride]
    history: list[AdminUserEntitlementHistoryItem]
    decisions: list[AdminEntitlementDecision]
    degradation: AdminUserDegradationPreview


class AdminPlanItem(BaseModel):
    id: UUID
    code: str
    version: int
    name: str
    price_month: int | None
    price_year: int | None
    effective_from: datetime
    features: dict[str, bool]
    limits: dict[str, int | None]
    active_subscriptions: int
    matches_catalog: bool


class AdminPlanCatalog(BaseModel):
    catalog_version: int
    source: str
    items: list[AdminPlanItem]


class AdminUserRoleUpdate(BaseModel):
    role: Literal["user", "teacher", "moderator", "admin"]
    reason: str = Field(min_length=10, max_length=500)


class AdminUserStatusUpdate(BaseModel):
    status: Literal["active", "suspended"]
    reason: str = Field(min_length=10, max_length=500)


class AdminUserEntitlementGrant(BaseModel):
    key: str = Field(min_length=1, max_length=80)
    value: bool | int | Literal["unlimited"]
    valid_until: datetime | None = None
    reason: str = Field(min_length=10, max_length=240)


class AdminUserEntitlementRevoke(BaseModel):
    reason: str = Field(min_length=10, max_length=500)


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
