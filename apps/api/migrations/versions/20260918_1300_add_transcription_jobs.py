"""add transcription jobs

Revision ID: transcription_jobs
Revises: merge_e6a_bot
Create Date: 2026-09-18 13:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "transcription_jobs"
down_revision: str | None = "merge_e6a_bot"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    status = sa.Enum(
        "uploading", "queued", "converting", "transcribing", "completed", "failed",
        name="transcriptionstatus",
    )
    op.create_table(
        "transcription_jobs",
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("content_type", sa.String(length=120), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("total_parts", sa.Integer(), nullable=False),
        sa.Column("uploaded_parts", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("status", status, server_default=sa.text("'uploading'"), nullable=False),
        sa.Column("language", sa.String(length=12), nullable=True),
        sa.Column("beam_size", sa.Integer(), server_default=sa.text("5"), nullable=False),
        sa.Column("vad_filter", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("word_timestamps", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("result_text", sa.Text(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_transcription_jobs")),
    )
    op.create_index(op.f("ix_transcription_jobs_status"), "transcription_jobs", ["status"])


def downgrade() -> None:
    op.drop_index(op.f("ix_transcription_jobs_status"), table_name="transcription_jobs")
    op.drop_table("transcription_jobs")
    sa.Enum(name="transcriptionstatus").drop(op.get_bind())
