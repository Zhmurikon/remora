"""add course search sync queue

Revision ID: course_search_sync
Revises: battles
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "course_search_sync"
down_revision: str | None = "battles"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "course_search_sync",
        sa.Column("course_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("version", sa.Integer(), server_default=sa.text("1"), nullable=False),
        sa.Column("requested_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["course_id"], ["courses.id"], name=op.f("fk_course_search_sync_course_id_courses"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("course_id", name=op.f("pk_course_search_sync")),
    )
    op.create_index(
        op.f("ix_course_search_sync_requested_at"), "course_search_sync", ["requested_at"]
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_course_search_sync_requested_at"), table_name="course_search_sync")
    op.drop_table("course_search_sync")
