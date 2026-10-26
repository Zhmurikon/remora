"""Переименовать публичное достижение после ребрендинга.

Revision ID: rename_remora_achievement
Revises: transcription_provider
Create Date: 2026-10-26 09:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "rename_remora_achievement"
down_revision: str | None = "transcription_provider"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        sa.text("UPDATE achievements SET title = :title WHERE code = :code").bindparams(
            title="Неутомимый ученик",
            code="reviews_10000",
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text("UPDATE achievements SET title = :title WHERE code = :code").bindparams(
            title="Неутомимая ремора",
            code="reviews_10000",
        )
    )
