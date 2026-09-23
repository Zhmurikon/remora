"""Контракт API удержания."""

import datetime as dt

from pydantic import BaseModel


class RetentionSummary(BaseModel):
    date: dt.date
    daily_goal: int
    reviews_today: int
    correct_today: int
    xp_today: int
    goal_completed: bool
    current_streak_days: int
    longest_streak_days: int
    last_active_date: dt.date | None
    freezes_left: int
    total_xp: int
    level: int
    current_level_xp: int
    next_level_xp: int


class ActivityDay(BaseModel):
    date: dt.date
    reviews_count: int
    correct_count: int
    xp_earned: int
    goal_reached_at: dt.datetime | None
    is_frozen: bool
