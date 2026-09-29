"""Дневная активность, серии и XP пользователя."""

from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
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


class Achievement(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Версионируемый справочник достижений, наполняемый миграциями."""

    __tablename__ = "achievements"

    code: Mapped[str] = mapped_column(String(60), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(100))
    description: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(30), index=True)
    metric: Mapped[str] = mapped_column(String(30), index=True)
    threshold: Mapped[int] = mapped_column(Integer)
    icon: Mapped[str] = mapped_column(String(30))
    sort_order: Mapped[int] = mapped_column(Integer, unique=True)


class UserAchievement(UUIDPrimaryKeyMixin, Base):
    """Одна навсегда выданная награда и состояние её показа пользователю."""

    __tablename__ = "user_achievements"
    __table_args__ = (
        UniqueConstraint(
            "user_id", "achievement_id", name="uq_user_achievements_user_id_achievement_id"
        ),
        Index("ix_user_achievements_user_id_unlocked_at", "user_id", "unlocked_at"),
    )

    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    achievement_id: Mapped[UUID] = mapped_column(ForeignKey("achievements.id", ondelete="CASCADE"))
    unlocked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )
    seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class XpReward(UUIDPrimaryKeyMixin, Base):
    """Идемпотентное начисление XP за результат вне карточного журнала."""

    __tablename__ = "xp_rewards"
    __table_args__ = (
        UniqueConstraint("user_id", "source", "source_key", name="uq_xp_rewards_user_source_key"),
    )

    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    source: Mapped[str] = mapped_column(String(40))
    source_key: Mapped[str] = mapped_column(String(200))
    xp: Mapped[int] = mapped_column(Integer)
    awarded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )
