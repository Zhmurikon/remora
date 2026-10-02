"""add Google OAuth provider identifier capacity

Revision ID: google_oauth
Revises: xp_rewards
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "google_oauth"
down_revision: str | None = "xp_rewards"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column(
        "oauth_accounts",
        "provider_user_id",
        existing_type=sa.String(length=128),
        type_=sa.String(length=255),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "oauth_accounts",
        "provider_user_id",
        existing_type=sa.String(length=255),
        type_=sa.String(length=128),
        existing_nullable=False,
    )
