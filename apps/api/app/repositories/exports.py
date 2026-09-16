"""Запросы для полного экспорта аккаунта."""

from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.base import Executable

from app.models.content import Card, Folder, MediaAsset, StudySet
from app.models.courses import Course, CourseArticle, CourseSection
from app.models.exports import AccountExportJob
from app.models.study import CardState, Review, StudySession, TestAttempt, UserSetProgress
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
        "media": await _all(db, select(MediaAsset).where(MediaAsset.owner_id == user_id)),
    }


async def _all(db: AsyncSession, query: Executable) -> list[Any]:
    result = await db.scalars(query)
    return list(result.all())
