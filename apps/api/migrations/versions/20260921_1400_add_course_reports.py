"""add course reports

Revision ID: e6a_course_reports
Revises: transcription_jobs
Create Date: 2026-09-21 14:00:00+00:00
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "e6a_course_reports"
down_revision: str | None = "transcription_jobs"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "course_reports",
        sa.Column("course_id", sa.Uuid(), nullable=False),
        sa.Column("reporter_id", sa.Uuid(), nullable=False),
        sa.Column("reason", sa.String(length=32), nullable=False),
        sa.Column("comment", sa.Text(), server_default=sa.text("''"), nullable=False),
        sa.Column("status", sa.String(length=16), server_default="open", nullable=False),
        sa.Column("resolved_by_id", sa.Uuid(), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.CheckConstraint(
            "reason IN ('spam', 'misleading', 'copyright', 'offensive', 'adult', 'other')",
            name=op.f("ck_course_reports_reason"),
        ),
        sa.CheckConstraint(
            "status IN ('open', 'accepted', 'rejected')",
            name=op.f("ck_course_reports_status"),
        ),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"], name=op.f("fk_course_reports_course_id_courses"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["reporter_id"], ["users.id"], name=op.f("fk_course_reports_reporter_id_users"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["resolved_by_id"], ["users.id"], name=op.f("fk_course_reports_resolved_by_id_users"), ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_course_reports")),
    )
    op.create_index(op.f("ix_course_reports_course_id"), "course_reports", ["course_id"])
    op.create_index(op.f("ix_course_reports_reporter_id"), "course_reports", ["reporter_id"])
    # Один открытый сигнал от пользователя на курс; разобранные жалобы не мешают новым.
    op.create_index(
        "uq_course_reports_open",
        "course_reports",
        ["course_id", "reporter_id"],
        unique=True,
        postgresql_where=sa.text("status = 'open'"),
    )


def downgrade() -> None:
    op.drop_index("uq_course_reports_open", table_name="course_reports")
    op.drop_index(op.f("ix_course_reports_reporter_id"), table_name="course_reports")
    op.drop_index(op.f("ix_course_reports_course_id"), table_name="course_reports")
    op.drop_table("course_reports")
