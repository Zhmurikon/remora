"""Привязать расшифровки к пользователям и недельной квоте.

Revision ID: user_transcriptions
Revises: admin_system_ops
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "user_transcriptions"
down_revision: str | None = "admin_system_ops"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("transcription_jobs", sa.Column("user_id", sa.Uuid(), nullable=True))
    op.add_column("transcription_jobs", sa.Column("title", sa.String(length=255), nullable=True))
    op.add_column("transcription_jobs", sa.Column("duration_seconds", sa.Integer(), nullable=True))
    op.add_column("transcription_jobs", sa.Column("quota_minutes", sa.Integer(), nullable=True))
    op.add_column(
        "transcription_jobs", sa.Column("quota_period_key", sa.String(length=10), nullable=True)
    )
    op.add_column(
        "transcription_jobs",
        sa.Column(
            "quota_released", sa.Boolean(), server_default=sa.text("false"), nullable=False
        ),
    )
    op.create_foreign_key(
        op.f("fk_transcription_jobs_user_id_users"),
        "transcription_jobs",
        "users",
        ["user_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(
        op.f("ix_transcription_jobs_user_id"), "transcription_jobs", ["user_id"]
    )
def downgrade() -> None:
    op.drop_index(op.f("ix_transcription_jobs_user_id"), table_name="transcription_jobs")
    op.drop_constraint(
        op.f("fk_transcription_jobs_user_id_users"), "transcription_jobs", type_="foreignkey"
    )
    op.drop_column("transcription_jobs", "quota_released")
    op.drop_column("transcription_jobs", "quota_period_key")
    op.drop_column("transcription_jobs", "quota_minutes")
    op.drop_column("transcription_jobs", "duration_seconds")
    op.drop_column("transcription_jobs", "title")
    op.drop_column("transcription_jobs", "user_id")
