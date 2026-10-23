"""add transcription provider

Revision ID: transcription_provider
Revises: yookassa_payments
Create Date: 2026-10-23 12:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "transcription_provider"
down_revision: str | None = "yookassa_payments"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    provider = sa.Enum("faster_whisper", "yandex_speechkit", name="transcriptionprovider")
    provider.create(op.get_bind(), checkfirst=True)
    op.add_column(
        "transcription_jobs",
        sa.Column(
            "provider",
            provider,
            server_default=sa.text("'faster_whisper'"),
            nullable=False,
        ),
    )
    op.add_column(
        "transcription_jobs",
        sa.Column("provider_operation_id", sa.String(length=120), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("transcription_jobs", "provider_operation_id")
    op.drop_column("transcription_jobs", "provider")
    sa.Enum(name="transcriptionprovider").drop(op.get_bind(), checkfirst=True)
