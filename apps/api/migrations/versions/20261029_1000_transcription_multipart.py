"""Добавить прямую multipart-загрузку исходников расшифровки.

Revision ID: transcription_multipart
Revises: user_transcriptions
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "transcription_multipart"
down_revision: str | None = "user_transcriptions"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "transcription_jobs", sa.Column("storage_key", sa.String(length=512), nullable=True)
    )
    op.add_column(
        "transcription_jobs",
        sa.Column("storage_upload_id", sa.String(length=512), nullable=True),
    )
    op.add_column(
        "transcription_jobs",
        sa.Column("upload_expires_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("transcription_jobs", "upload_expires_at")
    op.drop_column("transcription_jobs", "storage_upload_id")
    op.drop_column("transcription_jobs", "storage_key")
