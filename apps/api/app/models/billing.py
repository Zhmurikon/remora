"""Тарифы, подписки и персональные права пользователя."""

from __future__ import annotations

import enum
from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class SubscriptionStatus(enum.StrEnum):
    active = "active"
    canceled = "canceled"
    past_due = "past_due"
    expired = "expired"


class BillingInterval(enum.StrEnum):
    month = "month"
    year = "year"


class EntitlementSource(enum.StrEnum):
    promo = "promo"
    referral = "referral"
    grandfathering = "grandfathering"
    admin = "admin"


class PromoKind(enum.StrEnum):
    percent = "percent"
    free_days = "free_days"


class ReferralStatus(enum.StrEnum):
    registered = "registered"
    rewarded = "rewarded"
    rejected = "rejected"


class PaymentStatus(enum.StrEnum):
    pending = "pending"
    succeeded = "succeeded"
    canceled = "canceled"
    refunded = "refunded"


class Plan(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "plans"
    __table_args__ = (UniqueConstraint("code", "version", name="uq_plans_code_version"),)

    code: Mapped[str] = mapped_column(String(24), index=True)
    version: Mapped[int] = mapped_column(Integer)
    name: Mapped[str] = mapped_column(String(80))
    features: Mapped[dict[str, Any]] = mapped_column(JSONB)
    price_month: Mapped[int | None] = mapped_column(Integer)
    price_year: Mapped[int | None] = mapped_column(Integer)
    effective_from: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"))


class Subscription(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "subscriptions"

    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    plan_id: Mapped[UUID] = mapped_column(ForeignKey("plans.id", ondelete="RESTRICT"), index=True)
    status: Mapped[SubscriptionStatus] = mapped_column(index=True)
    interval: Mapped[BillingInterval]
    current_period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    current_period_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    cancel_at_period_end: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=text("false")
    )
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Entitlement(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "entitlements"

    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    key: Mapped[str] = mapped_column(String(80), index=True)
    value: Mapped[bool | int | str] = mapped_column(JSONB)
    source: Mapped[EntitlementSource]
    reason: Mapped[str] = mapped_column(String(240))
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    valid_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)


class PromoCode(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "promo_codes"

    code: Mapped[str] = mapped_column(String(48), unique=True, index=True)
    kind: Mapped[PromoKind]
    value: Mapped[int] = mapped_column(Integer)
    max_redemptions: Mapped[int | None] = mapped_column(Integer)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"))


class PromoRedemption(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "promo_redemptions"
    __table_args__ = (
        UniqueConstraint("promo_code_id", "user_id", name="uq_promo_redemptions_code_user"),
    )

    promo_code_id: Mapped[UUID] = mapped_column(
        ForeignKey("promo_codes.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    redeemed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class ReferralCode(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "referral_codes"

    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True
    )
    code: Mapped[str] = mapped_column(String(24), unique=True, index=True)


class Referral(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "referrals"

    code_id: Mapped[UUID] = mapped_column(
        ForeignKey("referral_codes.id", ondelete="RESTRICT"), index=True
    )
    inviter_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    invited_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True
    )
    status: Mapped[ReferralStatus] = mapped_column(
        default=ReferralStatus.registered, server_default=text("'registered'")
    )
    reward_days: Mapped[int] = mapped_column(Integer, default=30, server_default=text("30"))
    rewarded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    invited_subscription_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("subscriptions.id", ondelete="SET NULL"), index=True
    )
    inviter_subscription_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("subscriptions.id", ondelete="SET NULL"), index=True
    )
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Payment(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "payments"

    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    plan_id: Mapped[UUID] = mapped_column(ForeignKey("plans.id", ondelete="RESTRICT"), index=True)
    interval: Mapped[BillingInterval]
    status: Mapped[PaymentStatus] = mapped_column(
        default=PaymentStatus.pending, server_default=text("'pending'"), index=True
    )
    amount: Mapped[int] = mapped_column(Integer)
    discount_amount: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"))
    currency: Mapped[str] = mapped_column(String(3), default="RUB", server_default=text("'RUB'"))
    provider: Mapped[str] = mapped_column(String(24), default="yookassa")
    provider_payment_id: Mapped[str | None] = mapped_column(String(64), unique=True, index=True)
    idempotency_key: Mapped[str] = mapped_column(String(64), unique=True)
    confirmation_url: Mapped[str | None] = mapped_column(String(1024))
    promo_code_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("promo_codes.id", ondelete="SET NULL"), index=True
    )
    bonus_days: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"))
    receipt_url: Mapped[str | None] = mapped_column(String(1024))
    provider_payload: Mapped[dict[str, Any]] = mapped_column(
        JSONB, default=dict, server_default=text("'{}'::jsonb")
    )
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class PaymentEvent(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "payment_events"

    fingerprint: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    event: Mapped[str] = mapped_column(String(64))
    provider_payment_id: Mapped[str] = mapped_column(String(64), index=True)
    payment_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("payments.id", ondelete="SET NULL"), index=True
    )
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB)
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
