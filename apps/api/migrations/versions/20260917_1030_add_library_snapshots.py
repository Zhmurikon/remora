"""add accepted library snapshots

Revision ID: e6a_library_snapshots
Revises: e6a_library_saves
Create Date: 2026-09-17 10:30:00+00:00
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "e6a_library_snapshots"
down_revision: str | None = "e6a_library_saves"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "library_saves",
        sa.Column(
            "accepted_snapshot",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
    )
    op.add_column(
        "library_saves",
        sa.Column(
            "accepted_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("library_saves", "accepted_at")
    op.drop_column("library_saves", "accepted_snapshot")
