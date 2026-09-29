"""add course attachments

Revision ID: course_attachments
Revises: learn_session_size
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "course_attachments"
down_revision: str | None = "learn_session_size"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "course_attachments",
        sa.Column("course_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("article_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("mime", sa.String(length=255), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("s3_key", sa.String(length=500), nullable=False),
        sa.Column("status", sa.String(length=20), server_default="pending", nullable=False),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
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
        sa.CheckConstraint(
            "size_bytes > 0 AND size_bytes <= 104857600",
            name=op.f("ck_course_attachments_size_range"),
        ),
        sa.ForeignKeyConstraint(
            ["article_id"],
            ["course_articles.id"],
            name=op.f("fk_course_attachments_article_id_course_articles"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["course_id"],
            ["courses.id"],
            name=op.f("fk_course_attachments_course_id_courses"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_course_attachments")),
        sa.UniqueConstraint("s3_key", name=op.f("uq_course_attachments_s3_key")),
    )
    op.create_index(op.f("ix_course_attachments_article_id"), "course_attachments", ["article_id"])
    op.create_index(op.f("ix_course_attachments_course_id"), "course_attachments", ["course_id"])


def downgrade() -> None:
    op.drop_index(op.f("ix_course_attachments_course_id"), table_name="course_attachments")
    op.drop_index(op.f("ix_course_attachments_article_id"), table_name="course_attachments")
    op.drop_table("course_attachments")
