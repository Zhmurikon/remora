"""Задачи ИИ-помощника, связь с уроком и история конспекта."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "ai_assistant"
down_revision = "saved_set_folders"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "generation_jobs",
        sa.Column(
            "course_id", sa.Uuid(), sa.ForeignKey("courses.id", ondelete="SET NULL"), nullable=True
        ),
    )
    op.add_column("generation_jobs", sa.Column("article_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "fk_generation_jobs_article_id_course_articles",
        "generation_jobs",
        "course_articles",
        ["article_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_unique_constraint("uq_generation_jobs_article_id", "generation_jobs", ["article_id"])
    op.add_column("generation_jobs", sa.Column("edit_metadata", postgresql.JSONB(), nullable=True))
    op.create_table(
        "assistant_tasks",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("request_id", sa.Uuid(), nullable=False),
        sa.Column(
            "source_id",
            sa.Uuid(),
            sa.ForeignKey("transcription_jobs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("source_ids", postgresql.JSONB(), nullable=False),
        sa.Column("result", sa.String(20), nullable=False),
        sa.Column("options", postgresql.JSONB(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("error_message", sa.Text()),
        sa.Column("note_id", sa.Uuid(), sa.ForeignKey("generation_jobs.id", ondelete="SET NULL")),
        sa.Column("cards_id", sa.Uuid(), sa.ForeignKey("generation_jobs.id", ondelete="SET NULL")),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint("user_id", "request_id"),
        sa.UniqueConstraint("source_id"),
    )
    op.create_index("ix_assistant_tasks_user_id", "assistant_tasks", ["user_id"])
    op.create_index("ix_assistant_tasks_status", "assistant_tasks", ["status"])
    op.create_table(
        "note_revisions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "note_id",
            sa.Uuid(),
            sa.ForeignKey("generation_jobs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("markdown", sa.Text(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_note_revisions_note_id", "note_revisions", ["note_id"])
    # Только новые возможности: исторические цены и квоты подписчиков не меняем.
    op.execute(
        """UPDATE plans SET features = jsonb_set(jsonb_set(features, '{limits,ai.sources_per_task}', CASE code WHEN 'plus' THEN '2'::jsonb WHEN 'pro' THEN '5'::jsonb ELSE '0'::jsonb END), '{features,ai.refinement}', CASE code WHEN 'pro' THEN 'true'::jsonb ELSE 'false'::jsonb END) WHERE code IN ('free','plus','pro')"""
    )


def downgrade() -> None:
    op.drop_table("note_revisions")
    op.drop_table("assistant_tasks")
    op.drop_column("generation_jobs", "edit_metadata")
    op.drop_column("generation_jobs", "article_id")
    op.drop_column("generation_jobs", "course_id")
    op.execute(
        "UPDATE plans SET features = features #- '{limits,ai.sources_per_task}' #- '{features,ai.refinement}'"
    )
