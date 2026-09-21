"""add bot message id for Telegram edits

Revision ID: bot_message_id
Revises: set_learn_settings
Create Date: 2026-09-21 18:00:00+00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "bot_message_id"
down_revision: str | None = "set_learn_settings"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("bot_events", sa.Column("message_id", sa.String(length=64), nullable=True))


def downgrade() -> None:
    op.drop_column("bot_events", "message_id")
