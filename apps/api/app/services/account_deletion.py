"""Окончательная очистка аккаунтов после 30-дневного срока ожидания."""

from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.storage import get_object_storage
from app.models.api_tokens import AgentRequest, ApiToken
from app.models.bots import BotLink, BotLinkCode
from app.models.content import Card, Folder, MediaAsset, StudySet
from app.models.courses import Course, CourseArticle, CourseLike, CourseSection, LibrarySave
from app.models.exports import AccountExportJob
from app.models.imports import ImportJob
from app.models.moderation import CourseReport
from app.models.practice import PythonPracticeProgress
from app.models.retention import DailyActivity, Streak
from app.models.study import (
    CardState,
    Review,
    StudySession,
    TestAttempt,
    UserSetLearnSettings,
    UserSetProgress,
)
from app.models.tts import UsageCounter
from app.models.user import (
    AccountContentPolicy,
    ActionToken,
    Consent,
    OauthAccount,
    RefreshToken,
    User,
    UserRole,
    UserSettings,
    UserStatus,
)


async def purge_due_accounts(db: AsyncSession, *, now: datetime | None = None) -> int:
    cutoff = (now or datetime.now(UTC)) - timedelta(days=30)
    users = list(
        (
            await db.scalars(
                select(User).where(
                    User.status == UserStatus.deleted,
                    User.deleted_at.is_not(None),
                    User.deleted_at <= cutoff,
                )
            )
        ).all()
    )
    for user in users:
        await purge_account(db, user)
        await db.commit()
    return len(users)


async def purge_account(db: AsyncSession, user: User) -> None:
    storage_keys = await _storage_keys(db, user.id)
    if user.deletion_content_policy == AccountContentPolicy.archive_public.value:
        preserved_storage_keys = await _anonymize_with_public_archive(db, user)
        storage_keys = [key for key in storage_keys if key not in preserved_storage_keys]
    else:
        # `course_articles.set_id` — RESTRICT: сначала убираем оболочки курсов,
        # затем наборы, и только после этого каскадно удаляем пользователя.
        await db.execute(delete(Course).where(Course.owner_id == user.id))
        await db.flush()
        await db.execute(delete(StudySet).where(StudySet.owner_id == user.id))
        await db.flush()
        await db.delete(user)
        await db.flush()
    if storage_keys:
        await get_object_storage().delete_many(storage_keys)


async def _storage_keys(db: AsyncSession, user_id: UUID) -> list[str]:
    values: list[str | None] = []
    values.extend(
        (await db.scalars(select(MediaAsset.s3_key).where(MediaAsset.owner_id == user_id))).all()
    )
    values.extend(
        (await db.scalars(select(ImportJob.storage_key).where(ImportJob.user_id == user_id))).all()
    )
    values.extend(
        (
            await db.scalars(
                select(AccountExportJob.storage_key).where(AccountExportJob.user_id == user_id)
            )
        ).all()
    )
    return [value for value in values if value]


async def _anonymize_with_public_archive(db: AsyncSession, user: User) -> set[str]:
    public_course_ids = list(
        (
            await db.scalars(
                select(Course.id).where(Course.owner_id == user.id, Course.is_published.is_(True))
            )
        ).all()
    )
    await db.execute(
        delete(Course).where(Course.owner_id == user.id, Course.id.not_in(public_course_ids))
    )
    preserved_set_ids = list(
        (
            await db.scalars(
                select(CourseArticle.set_id)
                .join(CourseSection, CourseSection.id == CourseArticle.section_id)
                .where(CourseSection.course_id.in_(public_course_ids))
            )
        ).all()
    )
    await db.execute(
        delete(StudySet).where(
            StudySet.owner_id == user.id,
            StudySet.id.not_in(preserved_set_ids),
        )
    )
    await db.execute(delete(Folder).where(Folder.owner_id == user.id))

    preserved_media_ids = list(
        (
            await db.scalars(
                select(Card.term_image_id).where(
                    Card.set_id.in_(preserved_set_ids), Card.term_image_id.is_not(None)
                )
            )
        ).all()
    )
    preserved_media_ids.extend(
        (
            await db.scalars(
                select(Card.definition_image_id).where(
                    Card.set_id.in_(preserved_set_ids), Card.definition_image_id.is_not(None)
                )
            )
        ).all()
    )
    preserved_storage_keys = set(
        (
            await db.scalars(
                select(MediaAsset.s3_key).where(MediaAsset.id.in_(preserved_media_ids))
            )
        ).all()
    )
    await db.execute(
        update(MediaAsset)
        .where(MediaAsset.owner_id == user.id, MediaAsset.id.in_(preserved_media_ids))
        .values(owner_id=None)
    )
    await db.execute(
        delete(MediaAsset).where(
            MediaAsset.owner_id == user.id,
            MediaAsset.id.not_in(preserved_media_ids),
        )
    )

    direct_user_models = (
        UserSettings,
        RefreshToken,
        ActionToken,
        OauthAccount,
        Consent,
        ApiToken,
        AgentRequest,
        BotLink,
        BotLinkCode,
        CourseLike,
        LibrarySave,
        AccountExportJob,
        ImportJob,
        PythonPracticeProgress,
        DailyActivity,
        Streak,
        UserSetLearnSettings,
        CardState,
        Review,
        StudySession,
        TestAttempt,
        UserSetProgress,
        UsageCounter,
    )
    for model in direct_user_models:
        await db.execute(delete(model).where(model.user_id == user.id))
    await db.execute(delete(CourseReport).where(CourseReport.reporter_id == user.id))
    await db.execute(
        update(CourseReport)
        .where(CourseReport.resolved_by_id == user.id)
        .values(resolved_by_id=None)
    )

    suffix = user.id.hex[:16]
    user.email = None
    user.password_hash = None
    user.username = f"community-{suffix}"
    user.display_name = "Архив сообщества"
    user.avatar_url = None
    user.role = UserRole.user
    user.email_verified_at = None
    user.birth_date = None
    user.locale = "ru"
    user.timezone = "Europe/Moscow"
    user.deletion_content_policy = None
    await db.flush()
    return preserved_storage_keys
