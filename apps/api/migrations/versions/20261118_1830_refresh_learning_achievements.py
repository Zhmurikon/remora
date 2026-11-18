"""Обновить учебные достижения и добавить новые рубежи."""

from collections.abc import Sequence
from uuid import uuid4

import sqlalchemy as sa
from alembic import op

revision: str = "refresh_learning_achievements"
down_revision: str | None = "ai_assistant"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            UPDATE achievements
            SET description = :description, threshold = :threshold, updated_at = now()
            WHERE code = :code
            """
        ).bindparams(
            code="reviews_10",
            description="Ответьте на 20 карточек",
            threshold=20,
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE achievements
            SET code = :new_code,
                title = :title,
                description = :description,
                threshold = :threshold,
                updated_at = now()
            WHERE code = :old_code
            """
        ).bindparams(
            old_code="reviews_50",
            new_code="reviews_67",
            title="67",
            description="Ответьте на 67 карточек",
            threshold=67,
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE achievements
            SET code = :new_code,
                title = :title,
                description = :description,
                threshold = :threshold,
                updated_at = now()
            WHERE code = :old_code
            """
        ).bindparams(
            old_code="reviews_100",
            new_code="reviews_200",
            title="Жених, приехал",
            description="Ответьте на 200 карточек",
            threshold=200,
        )
    )

    achievements = sa.table(
        "achievements",
        sa.column("id"),
        sa.column("code"),
        sa.column("title"),
        sa.column("description"),
        sa.column("category"),
        sa.column("metric"),
        sa.column("threshold"),
        sa.column("icon"),
        sa.column("sort_order"),
    )
    op.bulk_insert(
        achievements,
        [
            {
                "id": uuid4(),
                "code": "reviews_300",
                "title": "Спартанец",
                "description": "Ответьте на 300 карточек",
                "category": "Обучение",
                "metric": "reviews",
                "threshold": 300,
                "icon": "shield",
                "sort_order": 45,
            },
            {
                "id": uuid4(),
                "code": "reviews_777",
                "title": "Big Win",
                "description": "Ответьте на 777 карточек",
                "category": "Обучение",
                "metric": "reviews",
                "threshold": 777,
                "icon": "trophy",
                "sort_order": 55,
            },
        ],
    )


def downgrade() -> None:
    op.execute(sa.text("DELETE FROM achievements WHERE code IN ('reviews_300', 'reviews_777')"))
    op.execute(
        sa.text(
            """
            UPDATE achievements
            SET code = 'reviews_100',
                title = 'Первая сотня',
                description = 'Ответьте на 100 карточек',
                threshold = 100,
                updated_at = now()
            WHERE code = 'reviews_200'
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE achievements
            SET code = 'reviews_50',
                title = 'Хороший темп',
                description = 'Ответьте на 50 карточек',
                threshold = 50,
                updated_at = now()
            WHERE code = 'reviews_67'
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE achievements
            SET description = 'Ответьте на 10 карточек',
                threshold = 10,
                updated_at = now()
            WHERE code = 'reviews_10'
            """
        )
    )
