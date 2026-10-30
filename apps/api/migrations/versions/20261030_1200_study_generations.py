"""Добавил задания конспектов и карточек

Revision ID: ebbb0465edc7
Revises: transcription_options
Create Date: 2026-10-30 06:48:46.602696+00:00
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "ebbb0465edc7"
down_revision: str | None = "transcription_options"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "generation_jobs",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("transcription_id", sa.Uuid(), nullable=False),
        sa.Column("request_id", sa.Uuid(), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("source_text", sa.Text(), nullable=False),
        sa.Column("source_hash", sa.String(length=64), nullable=False),
        sa.Column("parent_id", sa.Uuid(), nullable=True),
        sa.Column("model", sa.String(length=100), nullable=False),
        sa.Column("prompt_version", sa.String(length=32), nullable=False),
        sa.Column("request_body", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("provider_response", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("markdown", sa.Text(), nullable=True),
        sa.Column("cards", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("reserved_tokens", sa.Integer(), nullable=False),
        sa.Column("quota_period_key", sa.String(length=10), nullable=False),
        sa.Column("quota_settled", sa.Boolean(), nullable=False),
        sa.Column("input_tokens", sa.Integer(), nullable=True),
        sa.Column("output_tokens", sa.Integer(), nullable=True),
        sa.Column("estimated_cost_usd", sa.String(length=32), nullable=True),
        sa.Column("saved_set_id", sa.Uuid(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
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
            ["parent_id"],
            ["generation_jobs.id"],
            name=op.f("fk_generation_jobs_parent_id_generation_jobs"),
        ),
        sa.ForeignKeyConstraint(
            ["saved_set_id"],
            ["study_sets.id"],
            name=op.f("fk_generation_jobs_saved_set_id_study_sets"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["transcription_id"],
            ["transcription_jobs.id"],
            name=op.f("fk_generation_jobs_transcription_id_transcription_jobs"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_generation_jobs_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_generation_jobs")),
        sa.UniqueConstraint("user_id", "request_id", name=op.f("uq_generation_jobs_user_id")),
    )
    op.create_index(op.f("ix_generation_jobs_status"), "generation_jobs", ["status"], unique=False)
    op.create_index(
        op.f("ix_generation_jobs_transcription_id"),
        "generation_jobs",
        ["transcription_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_generation_jobs_user_id"), "generation_jobs", ["user_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_generation_jobs_user_id"), table_name="generation_jobs")
    op.drop_index(op.f("ix_generation_jobs_transcription_id"), table_name="generation_jobs")
    op.drop_index(op.f("ix_generation_jobs_status"), table_name="generation_jobs")
    op.drop_table("generation_jobs")
