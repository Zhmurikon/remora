"""add per-set learn settings

Revision ID: set_learn_settings
Revises: learn_settings
Create Date: 2026-09-21 17:00:00+00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "set_learn_settings"
down_revision: str | None = "learn_settings"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "user_set_learn_settings",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("set_id", sa.Uuid(), nullable=False),
        sa.Column("question_types", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("successes_required", sa.Integer(), nullable=False),
        sa.Column("typing_check", sa.String(length=12), nullable=False),
        sa.Column("match_percent", sa.Integer(), nullable=False),
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
            ["set_id"],
            ["study_sets.id"],
            name=op.f("fk_user_set_learn_settings_set_id_study_sets"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_user_set_learn_settings_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_user_set_learn_settings")),
        sa.UniqueConstraint("user_id", "set_id", name="uq_user_set_learn_settings_user_id_set_id"),
    )
    op.create_index(
        op.f("ix_user_set_learn_settings_set_id"), "user_set_learn_settings", ["set_id"]
    )
    op.create_index(
        op.f("ix_user_set_learn_settings_user_id"), "user_set_learn_settings", ["user_id"]
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_user_set_learn_settings_user_id"), table_name="user_set_learn_settings")
    op.drop_index(op.f("ix_user_set_learn_settings_set_id"), table_name="user_set_learn_settings")
    op.drop_table("user_set_learn_settings")
