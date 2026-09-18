"""add linked library saves

Revision ID: e6a_library_saves
Revises: e6a_course_likes
Create Date: 2026-09-17 09:30:00+00:00
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "e6a_library_saves"
down_revision: str | None = "e6a_course_likes"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "library_saves",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("course_id", sa.Uuid(), nullable=True),
        sa.Column("article_id", sa.Uuid(), nullable=True),
        sa.Column("set_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.CheckConstraint("num_nonnulls(course_id, article_id, set_id) = 1", name=op.f("ck_library_saves_exactly_one_target")),
        sa.ForeignKeyConstraint(["article_id"], ["course_articles.id"], name=op.f("fk_library_saves_article_id_course_articles"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"], name=op.f("fk_library_saves_course_id_courses"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["set_id"], ["study_sets.id"], name=op.f("fk_library_saves_set_id_study_sets"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_library_saves_user_id_users"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_library_saves")),
        sa.UniqueConstraint("user_id", "article_id", name="uq_library_saves_user_article"),
        sa.UniqueConstraint("user_id", "course_id", name="uq_library_saves_user_course"),
        sa.UniqueConstraint("user_id", "set_id", name="uq_library_saves_user_set"),
    )
    for column in ("user_id", "course_id", "article_id", "set_id"):
        op.create_index(f"ix_library_saves_{column}", "library_saves", [column])


def downgrade() -> None:
    op.drop_table("library_saves")
