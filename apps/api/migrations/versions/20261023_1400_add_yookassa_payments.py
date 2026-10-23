"""add yookassa payments

Revision ID: yookassa_payments
Revises: billing_foundation
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "yookassa_payments"
down_revision: str | None = "billing_foundation"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    payment_status = postgresql.ENUM(
        "pending", "succeeded", "canceled", "refunded", name="paymentstatus", create_type=False
    )
    payment_status.create(op.get_bind(), checkfirst=True)
    billing_interval = postgresql.ENUM(name="billinginterval", create_type=False)
    op.create_table(
        "payments",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("plan_id", sa.Uuid(), nullable=False),
        sa.Column("interval", billing_interval, nullable=False),
        sa.Column("status", payment_status, server_default=sa.text("'pending'"), nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("discount_amount", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("currency", sa.String(length=3), server_default=sa.text("'RUB'"), nullable=False),
        sa.Column("provider", sa.String(length=24), nullable=False),
        sa.Column("provider_payment_id", sa.String(length=64), nullable=True),
        sa.Column("idempotency_key", sa.String(length=64), nullable=False),
        sa.Column("confirmation_url", sa.String(length=1024), nullable=True),
        sa.Column("promo_code_id", sa.Uuid(), nullable=True),
        sa.Column("bonus_days", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("receipt_url", sa.String(length=1024), nullable=True),
        sa.Column(
            "provider_payload",
            postgresql.JSONB(),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["plan_id"], ["plans.id"], name=op.f("fk_payments_plan_id_plans"), ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["promo_code_id"],
            ["promo_codes.id"],
            name=op.f("fk_payments_promo_code_id_promo_codes"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_payments_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_payments")),
        sa.UniqueConstraint("idempotency_key", name=op.f("uq_payments_idempotency_key")),
    )
    for column in ("user_id", "plan_id", "status", "provider_payment_id", "promo_code_id"):
        op.create_index(
            op.f(f"ix_payments_{column}"),
            "payments",
            [column],
            unique=column == "provider_payment_id",
        )
    op.create_table(
        "payment_events",
        sa.Column("fingerprint", sa.String(length=64), nullable=False),
        sa.Column("event", sa.String(length=64), nullable=False),
        sa.Column("provider_payment_id", sa.String(length=64), nullable=False),
        sa.Column("payment_id", sa.Uuid(), nullable=True),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column(
            "received_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["payment_id"],
            ["payments.id"],
            name=op.f("fk_payment_events_payment_id_payments"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_payment_events")),
    )
    op.create_index(
        op.f("ix_payment_events_fingerprint"), "payment_events", ["fingerprint"], unique=True
    )
    op.create_index(
        op.f("ix_payment_events_provider_payment_id"),
        "payment_events",
        ["provider_payment_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_payment_events_payment_id"), "payment_events", ["payment_id"], unique=False
    )


def downgrade() -> None:
    op.drop_table("payment_events")
    op.drop_table("payments")
    postgresql.ENUM(name="paymentstatus").drop(op.get_bind(), checkfirst=True)
