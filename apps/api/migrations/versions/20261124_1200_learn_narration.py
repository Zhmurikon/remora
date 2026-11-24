"""Добавить сопровождение заучивания в существующие платные подписки."""

from alembic import op

revision = "learn_narration"
down_revision = "refresh_learning_achievements"


def upgrade() -> None:
    op.execute("""
        UPDATE plans SET features =
            jsonb_set(features, '{features,study.learn_narration}', 'true')
        WHERE code IN ('plus', 'pro')
    """)


def downgrade() -> None:
    op.execute("""
        UPDATE plans SET features = features #- '{features,study.learn_narration}'
        WHERE code IN ('plus', 'pro')
    """)
