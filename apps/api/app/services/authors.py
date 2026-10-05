"""Сборка публичного профиля автора и его учебных показателей."""

from datetime import date, datetime, timedelta
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError
from app.repositories import authors as repo
from app.repositories.search import course_documents
from app.schemas.authors import AuthorBadge, AuthorProfile, AuthorStats
from app.schemas.search import CourseSearchItem


def _current_streak(days: list[date], today: date) -> int:
    if not days or days[0] < today - timedelta(days=1):
        return 0
    expected = days[0]
    streak = 0
    for value in days:
        if value != expected:
            break
        streak += 1
        expected -= timedelta(days=1)
    return streak


_PROFILE_BADGES: tuple[tuple[str, str, str, str, int], ...] = (
    ("published_1", "Первый курс", "globe", "publications", 1),
    ("published_5", "Авторская серия", "library", "publications", 5),
    ("saves_10", "Полезный материал", "bookmark", "saves_received", 10),
    ("saves_100", "Выбор сообщества", "star", "saves_received", 100),
    ("likes_10", "Первые лайки", "heart", "likes_received", 10),
    ("likes_100", "Любимый автор", "heart", "likes_received", 100),
    ("studied_100", "Сто карточек", "cards", "cards_studied", 100),
    ("studied_1000", "Тысяча карточек", "brain", "cards_studied", 1000),
    ("streak_3", "Три дня в ритме", "flame", "current_streak_days", 3),
    ("streak_7", "Неделя в ритме", "flame", "current_streak_days", 7),
    ("streak_30", "Месяц привычки", "calendar", "current_streak_days", 30),
)


def _badges(stats: AuthorStats) -> list[AuthorBadge]:
    return [
        AuthorBadge(code=code, title=title, icon=icon)
        for code, title, icon, metric, threshold in _PROFILE_BADGES
        if getattr(stats, metric) >= threshold
    ]


class AuthorService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def profile(self, username: str) -> AuthorProfile:
        user = await repo.public_author(self.db, username)
        if user is None:
            raise NotFoundError("Автор не найден")
        documents = await course_documents(
            self.db, await repo.public_course_ids(self.db, user.id), include_content=False
        )
        if not documents:
            raise NotFoundError("Автор не найден")
        course_ids = [UUID(item["id"]) for item in documents]
        timezone = user.timezone
        try:
            today = datetime.now(ZoneInfo(timezone)).date()
        except ZoneInfoNotFoundError:
            timezone = "UTC"
            today = datetime.now(ZoneInfo(timezone)).date()
        days = await repo.study_dates(self.db, user.id, timezone)
        stats = AuthorStats(
            publications=len(documents),
            saves_received=await repo.saves_received(self.db, course_ids),
            likes_received=await repo.likes_received(self.db, course_ids),
            cards_studied=await repo.cards_studied(self.db, user.id),
            current_streak_days=_current_streak(days, today),
        )
        return AuthorProfile(
            id=user.id,
            username=user.username,
            display_name=user.display_name,
            avatar_url=user.avatar_url,
            joined_at=user.created_at,
            stats=stats,
            badges=_badges(stats),
            courses=[CourseSearchItem.model_validate(item) for item in documents],
        )
