"""add guardian consent

Revision ID: guardian_consent
Revises: admin_second_factor
Create Date: 2026-10-26 15:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "guardian_consent"
down_revision: str | None = "admin_second_factor"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "guardian_consent_requests",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("guardian_email", sa.String(length=320), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("document_version", sa.String(length=16), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("confirmation_ip", sa.String(length=45), nullable=True),
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
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_guardian_consent_requests_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_guardian_consent_requests")),
    )
    op.create_index(
        op.f("ix_guardian_consent_requests_user_id"),
        "guardian_consent_requests",
        ["user_id"],
        unique=True,
    )
    op.create_index(
        op.f("ix_guardian_consent_requests_token_hash"),
        "guardian_consent_requests",
        ["token_hash"],
        unique=True,
    )
    op.create_index(
        op.f("ix_guardian_consent_requests_expires_at"),
        "guardian_consent_requests",
        ["expires_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_guardian_consent_requests_expires_at"),
        table_name="guardian_consent_requests",
    )
    op.drop_index(
        op.f("ix_guardian_consent_requests_token_hash"),
        table_name="guardian_consent_requests",
    )
    op.drop_index(
        op.f("ix_guardian_consent_requests_user_id"),
        table_name="guardian_consent_requests",
    )
    op.drop_table("guardian_consent_requests")
