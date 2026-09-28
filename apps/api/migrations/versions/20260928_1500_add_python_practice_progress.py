"""add python practice progress

Revision ID: python_practice_progress
Revises: retention_core
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "python_practice_progress"
down_revision: str | None = "retention_core"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "python_practice_progress",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("task_id", sa.String(length=120), nullable=False),
        sa.Column("task_version", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("draft", sa.Text(), nullable=False),
        sa.Column("draft_updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_client_mutation_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "task_id", "task_version", name="uq_python_practice_progress_user_task_version"),
    )
    op.create_index(
        "ix_python_practice_progress_user_id",
        "python_practice_progress",
        ["user_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_python_practice_progress_user_id", table_name="python_practice_progress")
    op.drop_table("python_practice_progress")
