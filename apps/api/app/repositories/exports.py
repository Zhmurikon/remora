"""Запросы для полного экспорта аккаунта."""

from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.base import Executable

from app.models.api_tokens import ApiToken
from app.models.bots import BotLink
from app.models.content import Card, Folder, MediaAsset, StudySet
from app.models.courses import (
    Course,
    CourseArticle,
    CourseLike,
    CourseSection,
    LibrarySave,
)
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
from app.models.user import Consent, OauthAccount, UserSettings


async def get_job(db: AsyncSession, job_id: UUID) -> AccountExportJob | None:
    return await db.get(AccountExportJob, job_id)


async def latest_job(db: AsyncSession, user_id: UUID) -> AccountExportJob | None:
    result: AccountExportJob | None = await db.scalar(
        select(AccountExportJob)
        .where(AccountExportJob.user_id == user_id)
        .order_by(AccountExportJob.created_at.desc())
        .limit(1)
    )
    return result


async def account_rows(db: AsyncSession, user_id: UUID) -> dict[str, list[Any]]:
    sets = list((await db.scalars(select(StudySet).where(StudySet.owner_id == user_id))).all())
    set_ids = [item.id for item in sets]
    return {
        "courses": await _all(db, select(Course).where(Course.owner_id == user_id)),
        "course_sections": await _all(
            db, select(CourseSection).join(Course).where(Course.owner_id == user_id)
        ),
        "course_articles": await _all(
            db,
            select(CourseArticle)
            .join(CourseSection)
            .join(Course)
            .where(Course.owner_id == user_id),
        ),
        "settings": await _all(db, select(UserSettings).where(UserSettings.user_id == user_id)),
        "oauth_accounts": await _all(
            db, select(OauthAccount).where(OauthAccount.user_id == user_id)
        ),
        "consents": await _all(db, select(Consent).where(Consent.user_id == user_id)),
        "api_tokens": await _all(db, select(ApiToken).where(ApiToken.user_id == user_id)),
        "bot_links": await _all(db, select(BotLink).where(BotLink.user_id == user_id)),
        "import_jobs": await _all(db, select(ImportJob).where(ImportJob.user_id == user_id)),
        "export_jobs": await _all(
            db, select(AccountExportJob).where(AccountExportJob.user_id == user_id)
        ),
        "reports": await _all(db, select(CourseReport).where(CourseReport.reporter_id == user_id)),
        "moderated_reports": await _all(
            db, select(CourseReport).where(CourseReport.resolved_by_id == user_id)
        ),
        "folders": await _all(db, select(Folder).where(Folder.owner_id == user_id)),
        "sets": list(sets),
        "cards": await _all(db, select(Card).where(Card.set_id.in_(set_ids))) if set_ids else [],
        "card_states": await _all(db, select(CardState).where(CardState.user_id == user_id)),
        "reviews": await _all(db, select(Review).where(Review.user_id == user_id)),
        "study_sessions": await _all(
            db, select(StudySession).where(StudySession.user_id == user_id)
        ),
        "test_attempts": await _all(db, select(TestAttempt).where(TestAttempt.user_id == user_id)),
        "set_progress": await _all(
            db, select(UserSetProgress).where(UserSetProgress.user_id == user_id)
        ),
        "set_learn_settings": await _all(
            db, select(UserSetLearnSettings).where(UserSetLearnSettings.user_id == user_id)
        ),
        "course_likes": await _all(db, select(CourseLike).where(CourseLike.user_id == user_id)),
        "library_saves": await _all(db, select(LibrarySave).where(LibrarySave.user_id == user_id)),
        "daily_activity": await _all(
            db, select(DailyActivity).where(DailyActivity.user_id == user_id)
        ),
        "streaks": await _all(db, select(Streak).where(Streak.user_id == user_id)),
        "practice_progress": await _all(
            db, select(PythonPracticeProgress).where(PythonPracticeProgress.user_id == user_id)
        ),
        "usage_counters": await _all(
            db, select(UsageCounter).where(UsageCounter.user_id == user_id)
        ),
        "media": await _all(db, select(MediaAsset).where(MediaAsset.owner_id == user_id)),
    }


async def _all(db: AsyncSession, query: Executable) -> list[Any]:
    result = await db.scalars(query)
    return list(result.all())
