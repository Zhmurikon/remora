"""Добавить 2FA и аудит административной панели.

Revision ID: admin_security
Revises: blog_posts
Create Date: 2026-10-27 17:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "admin_security"
down_revision: str | None = "blog_posts"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "refresh_tokens",
        sa.Column("admin_2fa", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )
    op.create_table(
        "admin_totp",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("secret_ciphertext", sa.Text(), nullable=False),
        sa.Column(
            "recovery_code_hashes",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
        sa.Column("enabled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_admin_totp_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_admin_totp")),
    )
    op.create_index(op.f("ix_admin_totp_enabled_at"), "admin_totp", ["enabled_at"], unique=False)
    op.create_index(op.f("ix_admin_totp_user_id"), "admin_totp", ["user_id"], unique=True)

    op.create_table(
        "admin_audit_log",
        sa.Column("actor_user_id", sa.Uuid(), nullable=True),
        sa.Column("action", sa.String(length=80), nullable=False),
        sa.Column("outcome", sa.String(length=16), nullable=False),
        sa.Column("target_type", sa.String(length=48), nullable=True),
        sa.Column("target_id", sa.Uuid(), nullable=True),
        sa.Column("reason", sa.String(length=500), nullable=True),
        sa.Column("ip", sa.String(length=45), nullable=True),
        sa.Column("user_agent", sa.String(length=512), nullable=True),
        sa.Column(
            "details",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["actor_user_id"],
            ["users.id"],
            name=op.f("fk_admin_audit_log_actor_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_admin_audit_log")),
    )
    op.create_index(
        "ix_admin_audit_log_action_created",
        "admin_audit_log",
        ["action", "created_at"],
        unique=False,
    )
    op.create_index(
        "ix_admin_audit_log_actor_created",
        "admin_audit_log",
        ["actor_user_id", "created_at"],
        unique=False,
    )
    op.create_index(
        op.f("ix_admin_audit_log_action"), "admin_audit_log", ["action"], unique=False
    )
    op.create_index(
        op.f("ix_admin_audit_log_actor_user_id"),
        "admin_audit_log",
        ["actor_user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_admin_audit_log_outcome"), "admin_audit_log", ["outcome"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_admin_audit_log_outcome"), table_name="admin_audit_log")
    op.drop_index(op.f("ix_admin_audit_log_actor_user_id"), table_name="admin_audit_log")
    op.drop_index(op.f("ix_admin_audit_log_action"), table_name="admin_audit_log")
    op.drop_index("ix_admin_audit_log_actor_created", table_name="admin_audit_log")
    op.drop_index("ix_admin_audit_log_action_created", table_name="admin_audit_log")
    op.drop_table("admin_audit_log")
    op.drop_index(op.f("ix_admin_totp_user_id"), table_name="admin_totp")
    op.drop_index(op.f("ix_admin_totp_enabled_at"), table_name="admin_totp")
    op.drop_table("admin_totp")
    op.drop_column("refresh_tokens", "admin_2fa")
