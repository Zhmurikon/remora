"""add account export jobs

Revision ID: a8c1e42b904d
Revises: 7d5f16bfa201
Create Date: 2026-09-16 13:00:00.000000+00:00
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "a8c1e42b904d"
down_revision: str | None = "7d5f16bfa201"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    status = postgresql.ENUM(
        "queued", "processing", "completed", "failed", name="accountexportstatus", create_type=False
    )
    status.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "account_export_jobs",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("status", status, server_default=sa.text("'queued'"), nullable=False),
        sa.Column("progress", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("storage_key", sa.String(length=500), nullable=True),
        sa.Column("size_bytes", sa.Integer(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
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
            ["user_id"],
            ["users.id"],
            name=op.f("fk_account_export_jobs_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_account_export_jobs")),
        sa.UniqueConstraint("storage_key", name=op.f("uq_account_export_jobs_storage_key")),
    )
    op.create_index("ix_account_export_jobs_expires_at", "account_export_jobs", ["expires_at"])
    op.create_index(
        "ix_account_export_jobs_status_created_at", "account_export_jobs", ["status", "created_at"]
    )
    op.create_index(
        "ix_account_export_jobs_user_id_created_at",
        "account_export_jobs",
        ["user_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_account_export_jobs_user_id_created_at", table_name="account_export_jobs")
    op.drop_index("ix_account_export_jobs_status_created_at", table_name="account_export_jobs")
    op.drop_index("ix_account_export_jobs_expires_at", table_name="account_export_jobs")
    op.drop_table("account_export_jobs")
    sa.Enum(name="accountexportstatus").drop(op.get_bind(), checkfirst=True)
