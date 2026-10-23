"""add billing foundation

Revision ID: billing_foundation
Revises: classes_core
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "billing_foundation"
down_revision: str | None = "classes_core"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    subscription_status = postgresql.ENUM(
        "active", "canceled", "past_due", "expired", name="subscriptionstatus", create_type=False
    )
    billing_interval = postgresql.ENUM(
        "month", "year", name="billinginterval", create_type=False
    )
    entitlement_source = postgresql.ENUM(
        "promo", "referral", "grandfathering", "admin", name="entitlementsource", create_type=False
    )
    promo_kind = postgresql.ENUM(
        "percent", "free_days", name="promokind", create_type=False
    )
    referral_status = postgresql.ENUM(
        "registered", "rewarded", "rejected", name="referralstatus", create_type=False
    )
    for enum_type in (
        subscription_status,
        billing_interval,
        entitlement_source,
        promo_kind,
        referral_status,
    ):
        enum_type.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "plans",
        sa.Column("code", sa.String(length=24), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("features", postgresql.JSONB(), nullable=False),
        sa.Column("price_month", sa.Integer(), nullable=True),
        sa.Column("price_year", sa.Integer(), nullable=True),
        sa.Column("effective_from", sa.DateTime(timezone=True), nullable=False),
        sa.Column("active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_plans")),
        sa.UniqueConstraint("code", "version", name="uq_plans_code_version"),
    )
    op.create_index(op.f("ix_plans_code"), "plans", ["code"], unique=False)
    op.create_table(
        "subscriptions",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("plan_id", sa.Uuid(), nullable=False),
        sa.Column("status", subscription_status, nullable=False),
        sa.Column("interval", billing_interval, nullable=False),
        sa.Column("current_period_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("current_period_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("cancel_at_period_end", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["plan_id"], ["plans.id"], name=op.f("fk_subscriptions_plan_id_plans"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_subscriptions_user_id_users"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_subscriptions")),
    )
    op.create_index(op.f("ix_subscriptions_user_id"), "subscriptions", ["user_id"], unique=False)
    op.create_index(op.f("ix_subscriptions_plan_id"), "subscriptions", ["plan_id"], unique=False)
    op.create_index(op.f("ix_subscriptions_status"), "subscriptions", ["status"], unique=False)
    op.create_index(op.f("ix_subscriptions_current_period_end"), "subscriptions", ["current_period_end"], unique=False)
    op.create_table(
        "entitlements",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("key", sa.String(length=80), nullable=False),
        sa.Column("value", postgresql.JSONB(), nullable=False),
        sa.Column("source", entitlement_source, nullable=False),
        sa.Column("reason", sa.String(length=240), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("valid_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_entitlements_user_id_users"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_entitlements")),
    )
    op.create_index(op.f("ix_entitlements_user_id"), "entitlements", ["user_id"], unique=False)
    op.create_index(op.f("ix_entitlements_key"), "entitlements", ["key"], unique=False)
    op.create_index(op.f("ix_entitlements_valid_until"), "entitlements", ["valid_until"], unique=False)
    op.create_table(
        "promo_codes",
        sa.Column("code", sa.String(length=48), nullable=False),
        sa.Column("kind", promo_kind, nullable=False),
        sa.Column("value", sa.Integer(), nullable=False),
        sa.Column("max_redemptions", sa.Integer(), nullable=True),
        sa.Column("starts_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_promo_codes")),
    )
    op.create_index(op.f("ix_promo_codes_code"), "promo_codes", ["code"], unique=True)
    op.create_table(
        "promo_redemptions",
        sa.Column("promo_code_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("redeemed_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["promo_code_id"], ["promo_codes.id"], name=op.f("fk_promo_redemptions_promo_code_id_promo_codes"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_promo_redemptions_user_id_users"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_promo_redemptions")),
        sa.UniqueConstraint("promo_code_id", "user_id", name="uq_promo_redemptions_code_user"),
    )
    op.create_index(op.f("ix_promo_redemptions_promo_code_id"), "promo_redemptions", ["promo_code_id"], unique=False)
    op.create_index(op.f("ix_promo_redemptions_user_id"), "promo_redemptions", ["user_id"], unique=False)
    op.create_table(
        "referral_codes",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("code", sa.String(length=24), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_referral_codes_user_id_users"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_referral_codes")),
    )
    op.create_index(op.f("ix_referral_codes_user_id"), "referral_codes", ["user_id"], unique=True)
    op.create_index(op.f("ix_referral_codes_code"), "referral_codes", ["code"], unique=True)
    op.create_table(
        "referrals",
        sa.Column("code_id", sa.Uuid(), nullable=False),
        sa.Column("inviter_id", sa.Uuid(), nullable=False),
        sa.Column("invited_user_id", sa.Uuid(), nullable=False),
        sa.Column("status", referral_status, server_default=sa.text("'registered'"), nullable=False),
        sa.Column("reward_days", sa.Integer(), server_default=sa.text("30"), nullable=False),
        sa.Column("rewarded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["code_id"], ["referral_codes.id"], name=op.f("fk_referrals_code_id_referral_codes"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["invited_user_id"], ["users.id"], name=op.f("fk_referrals_invited_user_id_users"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["inviter_id"], ["users.id"], name=op.f("fk_referrals_inviter_id_users"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_referrals")),
    )
    op.create_index(op.f("ix_referrals_code_id"), "referrals", ["code_id"], unique=False)
    op.create_index(op.f("ix_referrals_inviter_id"), "referrals", ["inviter_id"], unique=False)
    op.create_index(op.f("ix_referrals_invited_user_id"), "referrals", ["invited_user_id"], unique=True)


def downgrade() -> None:
    for table in ("referrals", "referral_codes", "promo_redemptions", "promo_codes", "entitlements", "subscriptions", "plans"):
        op.drop_table(table)
    for name in ("referralstatus", "promokind", "entitlementsource", "billinginterval", "subscriptionstatus"):
        postgresql.ENUM(name=name).drop(op.get_bind(), checkfirst=True)
