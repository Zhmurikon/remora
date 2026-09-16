"""add import jobs

Revision ID: 7d5f16bfa201
Revises: 40c48e5c50a4
Create Date: 2026-09-16 09:00:00.000000+00:00
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "7d5f16bfa201"
down_revision: str | None = "40c48e5c50a4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    status = postgresql.ENUM(
        "queued", "processing", "completed", "failed", name="importjobstatus", create_type=False
    )
    status.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "import_jobs",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("set_id", sa.Uuid(), nullable=False),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("storage_key", sa.String(length=500), nullable=False),
        sa.Column("status", status, server_default=sa.text("'queued'"), nullable=False),
        sa.Column("progress", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("result", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "errors",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
        sa.Column("error_message", sa.Text(), nullable=True),
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
            ["set_id"],
            ["study_sets.id"],
            name=op.f("fk_import_jobs_set_id_study_sets"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_import_jobs_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_import_jobs")),
        sa.UniqueConstraint("storage_key", name=op.f("uq_import_jobs_storage_key")),
    )
    op.create_index("ix_import_jobs_status_created_at", "import_jobs", ["status", "created_at"])
    op.create_index("ix_import_jobs_user_id_created_at", "import_jobs", ["user_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_import_jobs_user_id_created_at", table_name="import_jobs")
    op.drop_index("ix_import_jobs_status_created_at", table_name="import_jobs")
    op.drop_table("import_jobs")
    sa.Enum(name="importjobstatus").drop(op.get_bind(), checkfirst=True)
