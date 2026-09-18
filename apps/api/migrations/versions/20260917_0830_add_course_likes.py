"""add course likes

Revision ID: e6a_course_likes
Revises: 45df4942a2bd
Create Date: 2026-09-17 08:30:00+00:00
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "e6a_course_likes"
down_revision: str | None = "45df4942a2bd"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "course_likes",
        sa.Column("course_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"], name=op.f("fk_course_likes_course_id_courses"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_course_likes_user_id_users"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_course_likes")),
        sa.UniqueConstraint("course_id", "user_id", name=op.f("uq_course_likes_course_id")),
    )
    op.create_index(op.f("ix_course_likes_course_id"), "course_likes", ["course_id"])
    op.create_index(op.f("ix_course_likes_user_id"), "course_likes", ["user_id"])


def downgrade() -> None:
    op.drop_index(op.f("ix_course_likes_user_id"), table_name="course_likes")
    op.drop_index(op.f("ix_course_likes_course_id"), table_name="course_likes")
    op.drop_table("course_likes")
