"""backfill retention streaks

Revision ID: retention_streak_backfill
Revises: folder_study_targets
"""

from collections.abc import Sequence

from alembic import op

revision: str = "retention_streak_backfill"
down_revision: str | None = "folder_study_targets"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Источник истины для XP — дневные агрегаты. Строки серии создаём для всех
    # пользователей один раз; динамические поля пересчитает сервис при обращении.
    op.execute(
        """
        INSERT INTO streaks (
            id, user_id, current_days, longest_days, last_active_date,
            freezes_left, total_xp
        )
        SELECT
            gen_random_uuid(), users.id, 0, 0, NULL, 2,
            coalesce(sum(daily_activity.xp_earned), 0)::integer
        FROM users
        LEFT JOIN daily_activity ON daily_activity.user_id = users.id
        GROUP BY users.id
        ON CONFLICT (user_id) DO UPDATE
        SET total_xp = excluded.total_xp,
            updated_at = now()
        """
    )


def downgrade() -> None:
    # Созданные строки неотличимы от появившихся при обычном обращении к API,
    # поэтому откат данных намеренно не удаляет их.
    pass
