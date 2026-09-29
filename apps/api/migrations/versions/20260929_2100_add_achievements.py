"""add achievements

Revision ID: achievements
Revises: course_attachments
"""

from collections.abc import Sequence
from uuid import uuid4

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "achievements"
down_revision: str | None = "course_attachments"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ACHIEVEMENTS = [
    (
        "first_review",
        "Первый шаг",
        "Ответьте на первую карточку",
        "Обучение",
        "reviews",
        1,
        "spark",
        10,
    ),
    ("reviews_10", "Разминка", "Ответьте на 10 карточек", "Обучение", "reviews", 10, "cards", 20),
    (
        "reviews_50",
        "Хороший темп",
        "Ответьте на 50 карточек",
        "Обучение",
        "reviews",
        50,
        "cards",
        30,
    ),
    (
        "reviews_100",
        "Первая сотня",
        "Ответьте на 100 карточек",
        "Обучение",
        "reviews",
        100,
        "cards",
        40,
    ),
    (
        "reviews_500",
        "Крепкая память",
        "Ответьте на 500 карточек",
        "Обучение",
        "reviews",
        500,
        "brain",
        50,
    ),
    (
        "reviews_1000",
        "Тысяча повторений",
        "Ответьте на 1 000 карточек",
        "Обучение",
        "reviews",
        1000,
        "brain",
        60,
    ),
    (
        "reviews_5000",
        "Марафон памяти",
        "Ответьте на 5 000 карточек",
        "Обучение",
        "reviews",
        5000,
        "crown",
        70,
    ),
    (
        "streak_3",
        "Три дня подряд",
        "Выполняйте цель 3 дня подряд",
        "Серия",
        "streak",
        3,
        "flame",
        80,
    ),
    (
        "streak_7",
        "Неделя в ритме",
        "Выполняйте цель 7 дней подряд",
        "Серия",
        "streak",
        7,
        "flame",
        90,
    ),
    (
        "streak_30",
        "Месяц привычки",
        "Держите серию 30 дней",
        "Серия",
        "streak",
        30,
        "calendar",
        100,
    ),
    (
        "streak_100",
        "Сто дней знаний",
        "Держите серию 100 дней",
        "Серия",
        "streak",
        100,
        "crown",
        110,
    ),
    ("xp_100", "Новый уровень", "Наберите 100 XP", "Опыт", "xp", 100, "bolt", 120),
    ("xp_1000", "Тысяча опыта", "Наберите 1 000 XP", "Опыт", "xp", 1000, "bolt", 130),
    ("xp_5000", "Опытный ученик", "Наберите 5 000 XP", "Опыт", "xp", 5000, "medal", 140),
    ("xp_10000", "Мастер повторений", "Наберите 10 000 XP", "Опыт", "xp", 10000, "crown", 150),
    ("sets_1", "Автор набора", "Создайте первый набор", "Творчество", "sets", 1, "edit", 160),
    ("sets_5", "Своя библиотека", "Создайте 5 наборов", "Творчество", "sets", 5, "library", 170),
    (
        "import_1",
        "Быстрый старт",
        "Завершите первый импорт",
        "Творчество",
        "imports",
        1,
        "upload",
        180,
    ),
    (
        "publish_1",
        "Поделиться знаниями",
        "Опубликуйте первый курс",
        "Сообщество",
        "published_courses",
        1,
        "globe",
        190,
    ),
    (
        "reviews_10000",
        "Неутомимая ремора",
        "Ответьте на 10 000 карточек",
        "Обучение",
        "reviews",
        10000,
        "trophy",
        200,
    ),
]


def upgrade() -> None:
    op.create_table(
        "achievements",
        sa.Column("code", sa.String(60), nullable=False),
        sa.Column("title", sa.String(100), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("category", sa.String(30), nullable=False),
        sa.Column("metric", sa.String(30), nullable=False),
        sa.Column("threshold", sa.Integer(), nullable=False),
        sa.Column("icon", sa.String(30), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_achievements")),
        sa.UniqueConstraint("code", name=op.f("uq_achievements_code")),
        sa.UniqueConstraint("sort_order", name=op.f("uq_achievements_sort_order")),
    )
    op.create_index(op.f("ix_achievements_code"), "achievements", ["code"])
    op.create_index(op.f("ix_achievements_category"), "achievements", ["category"])
    op.create_index(op.f("ix_achievements_metric"), "achievements", ["metric"])
    table = sa.table(
        "achievements",
        *(
            sa.column(name)
            for name in (
                "id",
                "code",
                "title",
                "description",
                "category",
                "metric",
                "threshold",
                "icon",
                "sort_order",
            )
        ),
    )
    columns = (
        "code",
        "title",
        "description",
        "category",
        "metric",
        "threshold",
        "icon",
        "sort_order",
    )
    op.bulk_insert(
        table,
        [dict(zip(columns, row, strict=True), id=uuid4()) for row in ACHIEVEMENTS],
    )
    op.create_table(
        "user_achievements",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("achievement_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "unlocked_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["achievement_id"],
            ["achievements.id"],
            name=op.f("fk_user_achievements_achievement_id_achievements"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_user_achievements_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_user_achievements")),
        sa.UniqueConstraint(
            "user_id", "achievement_id", name="uq_user_achievements_user_id_achievement_id"
        ),
    )
    op.create_index(
        "ix_user_achievements_user_id_unlocked_at", "user_achievements", ["user_id", "unlocked_at"]
    )


def downgrade() -> None:
    op.drop_table("user_achievements")
    op.drop_table("achievements")
