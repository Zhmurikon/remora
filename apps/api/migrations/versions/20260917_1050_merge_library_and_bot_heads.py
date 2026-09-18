"""merge library snapshots and bot learning payloads

Revision ID: merge_e6a_bot
Revises: e6a_library_snapshots, bot_learning_payloads
Create Date: 2026-09-17 10:50:00+00:00
"""

from collections.abc import Sequence

revision: str = "merge_e6a_bot"
down_revision: tuple[str, str] = ("e6a_library_snapshots", "bot_learning_payloads")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
