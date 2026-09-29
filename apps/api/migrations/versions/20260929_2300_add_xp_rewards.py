"""add idempotent xp rewards

Revision ID: xp_rewards
Revises: review_schedule_flag
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "xp_rewards"
down_revision: str | None = "review_schedule_flag"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "xp_rewards",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("source", sa.String(length=40), nullable=False),
        sa.Column("source_key", sa.String(length=200), nullable=False),
        sa.Column("xp", sa.Integer(), nullable=False),
        sa.Column(
            "awarded_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_xp_rewards_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_xp_rewards")),
        sa.UniqueConstraint(
            "user_id", "source", "source_key", name="uq_xp_rewards_user_source_key"
        ),
    )
    op.create_index(op.f("ix_xp_rewards_user_id"), "xp_rewards", ["user_id"])


def downgrade() -> None:
    op.drop_table("xp_rewards")
