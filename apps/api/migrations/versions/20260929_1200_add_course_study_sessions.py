"""add course study sessions

Revision ID: course_study_sessions
Revises: python_practice_progress
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "course_study_sessions"
down_revision: str | None = "python_practice_progress"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column("study_sessions", "set_id", existing_type=sa.Uuid(), nullable=True)
    op.add_column("study_sessions", sa.Column("course_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        op.f("fk_study_sessions_course_id_courses"),
        "study_sessions",
        "courses",
        ["course_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index("ix_study_sessions_course_id", "study_sessions", ["course_id"], unique=False)
    op.create_index(
        "ix_study_sessions_user_id_course_id_status",
        "study_sessions",
        ["user_id", "course_id", "status"],
        unique=False,
    )
    op.create_check_constraint(
        op.f("ck_study_sessions_exactly_one_target"),
        "study_sessions",
        "num_nonnulls(set_id, course_id) = 1",
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("ck_study_sessions_exactly_one_target"), "study_sessions", type_="check"
    )
    op.drop_index("ix_study_sessions_user_id_course_id_status", table_name="study_sessions")
    op.drop_index("ix_study_sessions_course_id", table_name="study_sessions")
    op.drop_constraint(
        op.f("fk_study_sessions_course_id_courses"), "study_sessions", type_="foreignkey"
    )
    op.drop_column("study_sessions", "course_id")
    op.alter_column("study_sessions", "set_id", existing_type=sa.Uuid(), nullable=False)
