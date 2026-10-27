"""Добавить редакционные публикации блога.

Revision ID: blog_posts
Revises: rename_remora_achievement
Create Date: 2026-10-27 15:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "blog_posts"
down_revision: str | None = "rename_remora_achievement"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "blog_posts",
        sa.Column("author_id", sa.Uuid(), nullable=False),
        sa.Column("slug", sa.String(length=120), nullable=False),
        sa.Column("status", sa.String(length=16), server_default="draft", nullable=False),
        sa.Column("title", sa.String(length=180), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=False),
        sa.Column("category", sa.String(length=80), nullable=False),
        sa.Column(
            "content",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("revision", sa.Integer(), server_default="1", nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
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
            ["author_id"],
            ["users.id"],
            name=op.f("fk_blog_posts_author_id_users"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_blog_posts")),
    )
    op.create_index(op.f("ix_blog_posts_author_id"), "blog_posts", ["author_id"], unique=False)
    op.create_index(op.f("ix_blog_posts_category"), "blog_posts", ["category"], unique=False)
    op.create_index(
        op.f("ix_blog_posts_published_at"), "blog_posts", ["published_at"], unique=False
    )
    op.create_index(op.f("ix_blog_posts_slug"), "blog_posts", ["slug"], unique=True)
    op.create_index(op.f("ix_blog_posts_status"), "blog_posts", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_blog_posts_status"), table_name="blog_posts")
    op.drop_index(op.f("ix_blog_posts_slug"), table_name="blog_posts")
    op.drop_index(op.f("ix_blog_posts_published_at"), table_name="blog_posts")
    op.drop_index(op.f("ix_blog_posts_category"), table_name="blog_posts")
    op.drop_index(op.f("ix_blog_posts_author_id"), table_name="blog_posts")
    op.drop_table("blog_posts")
