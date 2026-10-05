"""keep deleted course search tasks

Revision ID: keep_search_tasks
Revises: course_search_sync
"""

from collections.abc import Sequence

from alembic import op


revision: str = "keep_search_tasks"
down_revision: str | None = "course_search_sync"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint(
        op.f("fk_course_search_sync_course_id_courses"), "course_search_sync", type_="foreignkey"
    )


def downgrade() -> None:
    op.create_foreign_key(
        op.f("fk_course_search_sync_course_id_courses"),
        "course_search_sync",
        "courses",
        ["course_id"],
        ["id"],
        ondelete="CASCADE",
    )
