"""Связать реферальные начисления с выданными подписками.

Revision ID: 20261028_0900
Revises: admin_mutation_idempotency
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261028_0900"
down_revision: str | None = "admin_mutation_idempotency"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("referrals", sa.Column("invited_subscription_id", sa.Uuid(), nullable=True))
    op.add_column("referrals", sa.Column("inviter_subscription_id", sa.Uuid(), nullable=True))
    op.add_column("referrals", sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True))
    op.create_foreign_key(
        op.f("fk_referrals_invited_subscription_id_subscriptions"),
        "referrals",
        "subscriptions",
        ["invited_subscription_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        op.f("fk_referrals_inviter_subscription_id_subscriptions"),
        "referrals",
        "subscriptions",
        ["inviter_subscription_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        op.f("ix_referrals_invited_subscription_id"),
        "referrals",
        ["invited_subscription_id"],
    )
    op.create_index(
        op.f("ix_referrals_inviter_subscription_id"),
        "referrals",
        ["inviter_subscription_id"],
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_referrals_inviter_subscription_id"), table_name="referrals")
    op.drop_index(op.f("ix_referrals_invited_subscription_id"), table_name="referrals")
    op.drop_constraint(
        op.f("fk_referrals_inviter_subscription_id_subscriptions"),
        "referrals",
        type_="foreignkey",
    )
    op.drop_constraint(
        op.f("fk_referrals_invited_subscription_id_subscriptions"),
        "referrals",
        type_="foreignkey",
    )
    op.drop_column("referrals", "revoked_at")
    op.drop_column("referrals", "inviter_subscription_id")
    op.drop_column("referrals", "invited_subscription_id")
