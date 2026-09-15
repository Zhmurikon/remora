"""auth: users, user_settings, refresh_tokens, oauth_accounts, consents

Revision ID: e1a0c7d2f3b8
Revises: 5dbb0a6127ae
Create Date: 2026-09-14 12:00:00.000000+00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "e1a0c7d2f3b8"
down_revision: str | None = "5dbb0a6127ae"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Типы-перечисления. create_type=False — чтобы op.create_table не пытался
    # создать тип повторно; создание — через явный .create() выше.
    userrole = postgresql.ENUM(
        "user", "teacher", "moderator", "admin", name="userrole", create_type=False
    )
    userstatus = postgresql.ENUM(
        "active", "suspended", "deleted", name="userstatus", create_type=False
    )
    consentkind = postgresql.ENUM(
        "pdn", "offer", "marketing", "guardian", name="consentkind", create_type=False
    )
    userrole.create(op.get_bind(), checkfirst=True)
    userstatus.create(op.get_bind(), checkfirst=True)
    consentkind.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(320), unique=True, nullable=True),
        sa.Column("password_hash", sa.String(255), nullable=True),
        sa.Column("username", sa.String(32), unique=False, nullable=False),
        sa.Column("display_name", sa.String(64), nullable=True),
        sa.Column("avatar_url", sa.String(512), nullable=True),
        sa.Column("role", userrole, server_default=sa.text("'user'"), nullable=False),
        sa.Column(
            "email_verified_at", sa.TIMESTAMP(timezone=True), nullable=True
        ),
        sa.Column("birth_date", sa.Date(), nullable=True),
        sa.Column(
            "locale", sa.String(5), server_default=sa.text("'ru'"), nullable=False
        ),
        sa.Column(
            "timezone",
            sa.String(40),
            server_default=sa.text("'Europe/Moscow'"),
            nullable=False,
        ),
        sa.Column(
            "status",
            userstatus,
            server_default=sa.text("'active'"),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index("ix_users_email", "users", ["email"])
    op.create_index("ix_users_username", "users", ["username"])

    op.create_table(
        "user_settings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            unique=True,
            nullable=False,
        ),
        sa.Column(
            "daily_goal_cards",
            sa.Integer(),
            server_default=sa.text("20"),
            nullable=False,
        ),
        sa.Column(
            "fsrs_desired_retention",
            sa.Float(),
            server_default=sa.text("0.9"),
            nullable=False,
        ),
        sa.Column(
            "fsrs_max_interval_days",
            sa.Integer(),
            server_default=sa.text("365"),
            nullable=False,
        ),
        sa.Column(
            "new_cards_per_day",
            sa.Integer(),
            server_default=sa.text("20"),
            nullable=False,
        ),
        sa.Column(
            "reviews_per_day",
            sa.Integer(),
            server_default=sa.text("200"),
            nullable=False,
        ),
        sa.Column("tts_voice_preference", sa.String(32), nullable=True),
        sa.Column(
            "notification_channels",
            postgresql.JSONB(),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "theme",
            sa.String(10),
            server_default=sa.text("'system'"),
            nullable=False,
        ),
    )
    op.create_index("ix_user_settings_user_id", "user_settings", ["user_id"])

    op.create_table(
        "refresh_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("token_hash", sa.String(128), unique=True, nullable=False),
        sa.Column(
            "family_id", postgresql.UUID(as_uuid=True), nullable=False
        ),
        sa.Column(
            "expires_at", sa.TIMESTAMP(timezone=True), nullable=False
        ),
        sa.Column("revoked_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("user_agent", sa.String(512), nullable=True),
        sa.Column("ip", sa.String(45), nullable=True),
    )
    op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"])
    op.create_index("ix_refresh_tokens_token_hash", "refresh_tokens", ["token_hash"])
    op.create_index("ix_refresh_tokens_family_id", "refresh_tokens", ["family_id"])
    op.create_index("ix_refresh_tokens_expires_at", "refresh_tokens", ["expires_at"])

    op.create_table(
        "oauth_accounts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("provider", sa.String(16), nullable=False),
        sa.Column("provider_user_id", sa.String(128), nullable=False),
        sa.Column(
            "raw_profile",
            postgresql.JSONB(),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
    )
    op.create_index("ix_oauth_accounts_user_id", "oauth_accounts", ["user_id"])
    op.create_index("ix_oauth_accounts_provider", "oauth_accounts", ["provider"])
    op.create_index(
        "ix_oauth_accounts_provider_user_id",
        "oauth_accounts",
        ["provider_user_id"],
    )
    op.create_unique_constraint(
        "uq_oauth_accounts_provider_provider_user_id",
        "oauth_accounts",
        ["provider", "provider_user_id"],
    )

    op.create_table(
        "consents",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("kind", consentkind, nullable=False),
        sa.Column("version", sa.String(16), nullable=False),
        sa.Column(
            "accepted_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("ip", sa.String(45), nullable=True),
    )
    op.create_index("ix_consents_user_id", "consents", ["user_id"])
    op.create_index("ix_consents_kind", "consents", ["kind"])


def downgrade() -> None:
    op.drop_table("consents")
    op.drop_table("oauth_accounts")
    op.drop_table("refresh_tokens")
    op.drop_table("user_settings")
    op.drop_table("users")

    consentkind = postgresql.ENUM(name="consentkind")
    consentkind.drop(op.get_bind(), checkfirst=True)
    userstatus = postgresql.ENUM(name="userstatus")
    userstatus.drop(op.get_bind(), checkfirst=True)
    userrole = postgresql.ENUM(name="userrole")
    userrole.drop(op.get_bind(), checkfirst=True)
