"""add retention core

Revision ID: retention_core
Revises: public_sets_default
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "retention_core"
down_revision: str | None = "public_sets_default"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "daily_activity",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("activity_date", sa.Date(), nullable=False),
        sa.Column("reviews_count", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("correct_count", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("xp_earned", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("goal_reached_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_frozen", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
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
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "activity_date", name="uq_daily_activity_user_id_date"),
    )
    op.create_index(
        "ix_daily_activity_user_id_date", "daily_activity", ["user_id", "activity_date"]
    )
    op.create_table(
        "streaks",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("current_days", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("longest_days", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("last_active_date", sa.Date(), nullable=True),
        sa.Column("freezes_left", sa.Integer(), server_default=sa.text("2"), nullable=False),
        sa.Column("total_xp", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
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
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_streaks_user_id", "streaks", ["user_id"], unique=True)
    op.execute(
        """
        WITH ranked AS (
            SELECT
                reviews.user_id,
                reviews.reviewed_at,
                (timezone(users.timezone, reviews.reviewed_at))::date AS activity_date,
                reviews.duration_ms,
                CASE
                    WHEN reviews.answer_correct = true
                        OR (reviews.answer_correct IS NULL AND reviews.rating >= 3)
                    THEN true ELSE false
                END AS is_correct,
                row_number() OVER (
                    PARTITION BY reviews.user_id,
                        (timezone(users.timezone, reviews.reviewed_at))::date
                    ORDER BY reviews.reviewed_at, reviews.id
                ) AS number_in_day,
                coalesce(user_settings.daily_goal_cards, 20) AS daily_goal
            FROM reviews
            JOIN users ON users.id = reviews.user_id
            LEFT JOIN user_settings ON user_settings.user_id = reviews.user_id
        ), aggregated AS (
            SELECT
                user_id,
                activity_date,
                count(*)::integer AS reviews_count,
                count(*) FILTER (WHERE is_correct)::integer AS correct_count,
                sum(
                    CASE
                        WHEN duration_ms IS NOT NULL AND duration_ms < 300 THEN 0
                        WHEN number_in_day <= 20 THEN CASE WHEN is_correct THEN 10 ELSE 5 END
                        WHEN number_in_day <= 50 THEN CASE WHEN is_correct THEN 5 ELSE 2 END
                        ELSE 1
                    END
                )::integer AS xp_earned,
                min(reviewed_at) FILTER (WHERE number_in_day = daily_goal) AS goal_reached_at
            FROM ranked
            GROUP BY user_id, activity_date
        )
        INSERT INTO daily_activity (
            id, user_id, activity_date, reviews_count, correct_count, xp_earned,
            goal_reached_at, is_frozen
        )
        SELECT
            gen_random_uuid(), user_id, activity_date, reviews_count, correct_count,
            xp_earned, goal_reached_at, false
        FROM aggregated
        """
    )


def downgrade() -> None:
    op.drop_index("ix_streaks_user_id", table_name="streaks")
    op.drop_table("streaks")
    op.drop_index("ix_daily_activity_user_id_date", table_name="daily_activity")
    op.drop_table("daily_activity")
