"""Ретроактивная и идемпотентная выдача достижений."""

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.content import StudySet
from app.models.courses import Course
from app.models.imports import ImportJob, ImportJobStatus
from app.models.retention import Achievement, Streak, UserAchievement
from app.models.study import Review
from app.models.user import User
from app.repositories import achievements as repo
from app.schemas.retention import AchievementCollection, AchievementPublic


class AchievementService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def collection(self, user: User) -> AchievementCollection:
        definitions = await repo.list_definitions(self.db)
        metrics = await self._metrics(user)
        unlocked = {row.achievement_id: row for row in await repo.list_unlocked(self.db, user.id)}

        for item in definitions:
            if metrics.get(item.metric, 0) < item.threshold or item.id in unlocked:
                continue
            await self.db.execute(
                insert(UserAchievement)
                .values(user_id=user.id, achievement_id=item.id)
                .on_conflict_do_nothing(index_elements=["user_id", "achievement_id"])
            )
        await self.db.flush()
        unlocked = {row.achievement_id: row for row in await repo.list_unlocked(self.db, user.id)}
        items = [self._public(item, unlocked.get(item.id), metrics) for item in definitions]
        return AchievementCollection(
            unlocked_count=len(unlocked),
            total_count=len(definitions),
            items=items,
            newly_unlocked=[item for item in items if item.unlocked and not item.seen],
        )

    async def acknowledge(self, user: User) -> None:
        await repo.mark_seen(self.db, user.id)
        await self.db.flush()

    async def _metrics(self, user: User) -> dict[str, int]:
        reviews = int(
            await self.db.scalar(
                select(func.count()).select_from(Review).where(Review.user_id == user.id)
            )
            or 0
        )
        sets = int(
            await self.db.scalar(
                select(func.count())
                .select_from(StudySet)
                .where(StudySet.owner_id == user.id, StudySet.deleted_at.is_(None))
            )
            or 0
        )
        imports = int(
            await self.db.scalar(
                select(func.count())
                .select_from(ImportJob)
                .where(ImportJob.user_id == user.id, ImportJob.status == ImportJobStatus.completed)
            )
            or 0
        )
        published = int(
            await self.db.scalar(
                select(func.count())
                .select_from(Course)
                .where(Course.owner_id == user.id, Course.published_at.is_not(None))
            )
            or 0
        )
        streak = await self.db.scalar(select(Streak).where(Streak.user_id == user.id))
        return {
            "reviews": reviews,
            "sets": sets,
            "imports": imports,
            "published_courses": published,
            "streak": streak.longest_days if streak else 0,
            "xp": streak.total_xp if streak else 0,
        }

    @staticmethod
    def _public(
        item: Achievement, unlocked: UserAchievement | None, metrics: dict[str, int]
    ) -> AchievementPublic:
        return AchievementPublic(
            code=item.code,
            title=item.title,
            description=item.description,
            category=item.category,
            icon=item.icon,
            unlocked=unlocked is not None,
            unlocked_at=unlocked.unlocked_at if unlocked else None,
            seen=unlocked is not None and unlocked.seen_at is not None,
            progress=min(metrics.get(item.metric, 0), item.threshold),
            target=item.threshold,
        )
