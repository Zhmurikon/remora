"""separate review activity from schedule updates

Revision ID: review_schedule_flag
Revises: achievements
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "review_schedule_flag"
down_revision: str | None = "achievements"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "reviews",
        sa.Column("updates_schedule", sa.Boolean(), server_default=sa.text("true"), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("reviews", "updates_schedule")
