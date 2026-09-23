"""Дневная активность, серии и XP пользователя."""

from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Index, Integer, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class DailyActivity(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Итог одного локального дня пользователя.

    Строки с ``is_frozen`` и нулём ответов фиксируют уже использованную
    заморозку. Это позволяет пересчитать серию после прихода офлайн-ответов.
    """

    __tablename__ = "daily_activity"
    __table_args__ = (
        UniqueConstraint("user_id", "activity_date", name="uq_daily_activity_user_id_date"),
        Index("ix_daily_activity_user_id_date", "user_id", "activity_date"),
    )

    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    activity_date: Mapped[date] = mapped_column(Date)
    reviews_count: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"))
    correct_count: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"))
    xp_earned: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"))
    goal_reached_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_frozen: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))


class Streak(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Денормализованная текущая и лучшая серия пользователя."""

    __tablename__ = "streaks"

    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True
    )
    current_days: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"))
    longest_days: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"))
    last_active_date: Mapped[date | None] = mapped_column(Date)
    freezes_left: Mapped[int] = mapped_column(Integer, default=2, server_default=text("2"))
    total_xp: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"))
