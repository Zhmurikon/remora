"""Агрегаты публичного профиля; email и настройки сюда не попадают."""

from datetime import date
from uuid import UUID

from sqlalchemy import distinct, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.courses import Course, CourseArticle, CourseLike, CourseSection, LibrarySave
from app.models.study import Review
from app.models.user import User, UserStatus


async def public_author(db: AsyncSession, username: str) -> User | None:
    return (
        await db.scalars(
            select(User).where(
                User.username == username,
                User.status == UserStatus.active,
                User.deleted_at.is_(None),
            )
        )
    ).one_or_none()


async def public_course_ids(db: AsyncSession, user_id: UUID) -> list[UUID]:
    return list(
        await db.scalars(
            select(Course.id).where(Course.owner_id == user_id).order_by(Course.updated_at.desc())
        )
    )


async def likes_received(db: AsyncSession, course_ids: list[UUID]) -> int:
    if not course_ids:
        return 0
    value = await db.scalar(
        select(func.count(CourseLike.id)).where(CourseLike.course_id.in_(course_ids))
    )
    return int(value or 0)


async def saves_received(db: AsyncSession, course_ids: list[UUID]) -> int:
    if not course_ids:
        return 0
    saved_course_id = func.coalesce(LibrarySave.course_id, CourseSection.course_id)
    value = await db.scalar(
        select(func.count(LibrarySave.id))
        .select_from(LibrarySave)
        .outerjoin(
            CourseArticle,
            or_(
                LibrarySave.article_id == CourseArticle.id,
                LibrarySave.set_id == CourseArticle.set_id,
            ),
        )
        .outerjoin(CourseSection, CourseSection.id == CourseArticle.section_id)
        .where(saved_course_id.in_(course_ids))
    )
    return int(value or 0)


async def cards_studied(db: AsyncSession, user_id: UUID) -> int:
    value = await db.scalar(
        select(func.count(distinct(Review.card_id))).where(Review.user_id == user_id)
    )
    return int(value or 0)


async def study_dates(db: AsyncSession, user_id: UUID, timezone: str) -> list[date]:
    local_date = func.date(func.timezone(timezone, Review.reviewed_at))
    return list(
        await db.scalars(
            select(local_date)
            .where(Review.user_id == user_id)
            .group_by(local_date)
            .order_by(local_date.desc())
        )
    )
