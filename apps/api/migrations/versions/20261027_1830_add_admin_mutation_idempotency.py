"""Добавить идемпотентность административных изменений.

Revision ID: admin_mutation_idempotency
Revises: admin_security
Create Date: 2026-10-27 18:30:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "admin_mutation_idempotency"
down_revision: str | None = "admin_security"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "admin_audit_log",
        sa.Column("idempotency_key", sa.String(length=64), nullable=True),
    )
    op.create_index(
        op.f("ix_admin_audit_log_idempotency_key"),
        "admin_audit_log",
        ["idempotency_key"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_admin_audit_log_idempotency_key"), table_name="admin_audit_log")
    op.drop_column("admin_audit_log", "idempotency_key")
