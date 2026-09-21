"""add learn mode settings

Revision ID: learn_settings
Revises: e6a_course_reports
Create Date: 2026-09-21 16:00:00+00:00
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "learn_settings"
down_revision: str | None = "e6a_course_reports"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "user_settings",
        sa.Column(
            "learn_question_types",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[\"choice\", \"typing\", \"recall\"]'::jsonb"),
            nullable=False,
        ),
    )
    op.add_column(
        "user_settings",
        sa.Column("learn_successes_required", sa.Integer(), server_default="1", nullable=False),
    )
    op.add_column(
        "user_settings",
        sa.Column("learn_typing_check", sa.String(length=12), server_default="automatic", nullable=False),
    )
    op.add_column(
        "user_settings",
        sa.Column("learn_match_percent", sa.Integer(), server_default="90", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("user_settings", "learn_match_percent")
    op.drop_column("user_settings", "learn_typing_check")
    op.drop_column("user_settings", "learn_successes_required")
    op.drop_column("user_settings", "learn_question_types")
