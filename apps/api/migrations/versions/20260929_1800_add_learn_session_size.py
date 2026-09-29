"""add learn session size

Revision ID: learn_session_size
Revises: retention_streak_backfill
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "learn_session_size"
down_revision: str | None = "retention_streak_backfill"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "user_settings",
        sa.Column("learn_session_size", sa.Integer(), server_default="10", nullable=False),
    )
    op.add_column(
        "user_set_learn_settings",
        sa.Column("session_size", sa.Integer(), server_default="10", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("user_set_learn_settings", "session_size")
    op.drop_column("user_settings", "learn_session_size")
