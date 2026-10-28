"""Добавить фиче-флаги и журнал инцидентов.

Revision ID: admin_system_ops
Revises: 20261028_0900
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "admin_system_ops"
down_revision: str | None = "20261028_0900"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "feature_flags",
        sa.Column("key", sa.String(length=120), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=False),
        sa.Column("enabled", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("environment", sa.String(length=24), nullable=False),
        sa.Column("owner", sa.String(length=160), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_by", sa.Uuid(), nullable=True),
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
            ["updated_by"],
            ["users.id"],
            name=op.f("fk_feature_flags_updated_by_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_feature_flags")),
        sa.UniqueConstraint("key", "environment", name=op.f("uq_feature_flags_key")),
    )
    op.create_index(
        op.f("ix_feature_flags_environment_enabled"), "feature_flags", ["environment", "enabled"]
    )
    op.create_index(op.f("ix_feature_flags_expires_at"), "feature_flags", ["expires_at"])
    op.create_index(op.f("ix_feature_flags_updated_by"), "feature_flags", ["updated_by"])
    op.create_table(
        "admin_incidents",
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("severity", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=16), server_default="open", nullable=False),
        sa.Column("external_url", sa.String(length=1000), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("updated_by", sa.Uuid(), nullable=True),
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
            ["created_by"],
            ["users.id"],
            name=op.f("fk_admin_incidents_created_by_users"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["updated_by"],
            ["users.id"],
            name=op.f("fk_admin_incidents_updated_by_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_admin_incidents")),
    )
    op.create_index(op.f("ix_admin_incidents_created_by"), "admin_incidents", ["created_by"])
    op.create_index(
        op.f("ix_admin_incidents_status_started"), "admin_incidents", ["status", "started_at"]
    )
    op.create_index(op.f("ix_admin_incidents_updated_by"), "admin_incidents", ["updated_by"])


def downgrade() -> None:
    op.drop_index(op.f("ix_admin_incidents_updated_by"), table_name="admin_incidents")
    op.drop_index(op.f("ix_admin_incidents_status_started"), table_name="admin_incidents")
    op.drop_index(op.f("ix_admin_incidents_created_by"), table_name="admin_incidents")
    op.drop_table("admin_incidents")
    op.drop_index(op.f("ix_feature_flags_updated_by"), table_name="feature_flags")
    op.drop_index(op.f("ix_feature_flags_expires_at"), table_name="feature_flags")
    op.drop_index(op.f("ix_feature_flags_environment_enabled"), table_name="feature_flags")
    op.drop_table("feature_flags")
