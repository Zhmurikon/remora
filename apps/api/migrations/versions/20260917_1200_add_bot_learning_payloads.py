"""add bot learning payloads

Revision ID: bot_learning_payloads
Revises: e6a_library_saves
Create Date: 2026-09-17 12:00:00+00:00
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "bot_learning_payloads"
down_revision: str | None = "e6a_library_saves"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column("bot_events", "command", type_=sa.String(length=96))
    op.add_column("bot_events", sa.Column("input", sa.Text(), nullable=True))
    op.add_column(
        "bot_events",
        sa.Column(
            "reply_keyboard",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
    )
    op.add_column("bot_events", sa.Column("audio_url", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("bot_events", "audio_url")
    op.drop_column("bot_events", "reply_keyboard")
    op.drop_column("bot_events", "input")
    op.alter_column("bot_events", "command", type_=sa.String(length=16))
