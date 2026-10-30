"""Добавить настройки и структурированный результат SpeechKit.

Revision ID: transcription_options
Revises: transcription_multipart
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "transcription_options"
down_revision: str | None = "transcription_multipart"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "transcription_jobs",
        sa.Column("fast_mode", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )
    op.add_column(
        "transcription_jobs",
        sa.Column(
            "phrase_timestamps", sa.Boolean(), server_default=sa.text("false"), nullable=False
        ),
    )
    op.add_column(
        "transcription_jobs",
        sa.Column(
            "speaker_labeling", sa.Boolean(), server_default=sa.text("false"), nullable=False
        ),
    )
    op.add_column(
        "transcription_jobs",
        sa.Column("provider_result", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("transcription_jobs", "provider_result")
    op.drop_column("transcription_jobs", "speaker_labeling")
    op.drop_column("transcription_jobs", "phrase_timestamps")
    op.drop_column("transcription_jobs", "fast_mode")
