"""add account deletion policy

Revision ID: account_deletion_policy
Revises: python_practice_progress
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "account_deletion_policy"
down_revision: str | None = "python_practice_progress"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users", sa.Column("deletion_content_policy", sa.String(length=24), nullable=True)
    )
    op.create_check_constraint(
        "ck_users_deletion_content_policy",
        "users",
        "deletion_content_policy IS NULL OR deletion_content_policy IN ('delete', 'archive_public')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_users_deletion_content_policy", "users", type_="check")
    op.drop_column("users", "deletion_content_policy")
