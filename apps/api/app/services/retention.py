"""Учёт дневной активности, серий, заморозок и XP."""

from __future__ import annotations

from collections import defaultdict
from datetime import UTC, date, datetime, timedelta
from math import isqrt
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.retention import DailyActivity, Streak
from app.models.user import User
from app.repositories import retention as repo
from app.repositories import study as study_repo
from app.repositories import user as user_repo
from app.schemas.retention import ActivityDay, RetentionSummary
from app.schemas.study import ReviewIn

FREEZES_PER_MONTH = 2
MIN_XP_DURATION_MS = 300


class RetentionService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def record_reviews(self, user: User, reviews: list[ReviewIn]) -> None:
        """Учитывает только уже принятые ``StudyService`` ответы."""
        if not reviews:
            return
        settings = await user_repo.get_or_create_settings(self.db, user.id)
        streak = await repo.streak_for_update(self.db, user.id)
        zone = _zone(user.timezone)
        for review in reviews:
            moment = _utc(review.reviewed_at)
            local_date = moment.astimezone(zone).date()
            activity = await repo.activity_for_update(self.db, user.id, local_date)
            activity.is_frozen = False
            activity.reviews_count += 1
            if review.answer_correct is True or (
                review.answer_correct is None and review.rating >= 3
            ):
                activity.correct_count += 1
            gained = _review_xp(review, activity.reviews_count)
            activity.xp_earned += gained
            streak.total_xp += gained
            if (
                activity.goal_reached_at is None
                and activity.reviews_count >= settings.daily_goal_cards
            ):
                activity.goal_reached_at = moment
        await self._rebuild_streak(user, streak)
        await self.db.flush()

    async def summary(self, user: User, *, now: datetime | None = None) -> RetentionSummary:
        await study_repo.lock_learning(self.db, user.id)
        moment = now or datetime.now(UTC)
        today = moment.astimezone(_zone(user.timezone)).date()
        settings = await user_repo.get_or_create_settings(self.db, user.id)
        streak = await repo.streak_for_update(self.db, user.id)
        await self._rebuild_streak(user, streak, today=today)
        activity = await repo.activity_for_update(self.db, user.id, today)
        level = _level(streak.total_xp)
        await self.db.flush()
        return RetentionSummary(
            date=today,
            daily_goal=settings.daily_goal_cards,
            reviews_today=activity.reviews_count,
            correct_today=activity.correct_count,
            xp_today=activity.xp_earned,
            goal_completed=activity.goal_reached_at is not None,
            current_streak_days=streak.current_days,
            longest_streak_days=streak.longest_days,
            last_active_date=streak.last_active_date,
            freezes_left=streak.freezes_left,
            total_xp=streak.total_xp,
            level=level,
            current_level_xp=streak.total_xp - _level_start(level),
            next_level_xp=_level_start(level + 1) - _level_start(level),
        )

    async def activity(self, user: User, start: date, end: date) -> list[ActivityDay]:
        return [
            ActivityDay(
                date=row.activity_date,
                reviews_count=row.reviews_count,
                correct_count=row.correct_count,
                xp_earned=row.xp_earned,
                goal_reached_at=row.goal_reached_at,
                is_frozen=row.is_frozen,
            )
            for row in await repo.list_activity(self.db, user.id, start, end)
        ]

    async def _rebuild_streak(
        self, user: User, streak: Streak, *, today: date | None = None
    ) -> None:
        today = today or datetime.now(_zone(user.timezone)).date()
        await repo.delete_freezes(self.db, user.id)
        await self.db.flush()
        activities = await repo.list_activity(self.db, user.id)
        completed = {row.activity_date for row in activities if row.goal_reached_at is not None}
        if not completed:
            streak.current_days = 0
            streak.longest_days = 0
            streak.last_active_date = None
            streak.freezes_left = FREEZES_PER_MONTH
            return

        used: dict[tuple[int, int], int] = defaultdict(int)
        current = longest = 0
        cursor = min(completed)
        end = max(max(completed), today - timedelta(days=1))
        while cursor <= end:
            if cursor in completed:
                current += 1
                longest = max(longest, current)
            elif current:
                month = (cursor.year, cursor.month)
                if used[month] < FREEZES_PER_MONTH:
                    frozen = DailyActivity(user_id=user.id, activity_date=cursor, is_frozen=True)
                    self.db.add(frozen)
                    used[month] += 1
                    current += 1
                    longest = max(longest, current)
                else:
                    current = 0
            cursor += timedelta(days=1)

        last_completed = max(completed)
        if last_completed < today - timedelta(days=1) and current == 0:
            current = 0
        streak.current_days = current
        streak.longest_days = max(streak.longest_days, longest)
        streak.last_active_date = last_completed
        streak.freezes_left = FREEZES_PER_MONTH - used[(today.year, today.month)]


def _review_xp(review: ReviewIn, number_in_day: int) -> int:
    if review.duration_ms is not None and review.duration_ms < MIN_XP_DURATION_MS:
        return 0
    correct = review.answer_correct is True or (
        review.answer_correct is None and review.rating >= 3
    )
    base = 10 if correct else 5
    if number_in_day <= 20:
        return base
    if number_in_day <= 50:
        return max(1, base // 2)
    return 1


def _zone(name: str) -> ZoneInfo:
    try:
        return ZoneInfo(name)
    except ZoneInfoNotFoundError:
        return ZoneInfo("UTC")


def _utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def _level(total_xp: int) -> int:
    return isqrt(max(0, total_xp) // 100) + 1


def _level_start(level: int) -> int:
    return 100 * max(0, level - 1) ** 2
