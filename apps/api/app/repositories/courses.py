"""Доступ к структуре курсов без решений о правах пользователя."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.courses import Course, CourseArticle, CourseSection
from app.models.user import User, UserStatus


async def get_course(db: AsyncSession, course_id: UUID) -> Course | None:
    return await db.get(Course, course_id)


async def public_course(db: AsyncSession, slug: str) -> Course | None:
    result = await db.scalars(
        select(Course)
        .join(User, User.id == Course.owner_id)
        .where(
            Course.slug == slug,
            Course.is_published.is_(True),
            Course.moderation_status != "blocked",
            User.status == UserStatus.active,
            User.deleted_at.is_(None),
        )
    )
    return result.one_or_none()


async def course_for_set(db: AsyncSession, set_id: UUID) -> Course | None:
    result = await db.scalars(
        select(Course).join(CourseSection).join(CourseArticle).where(CourseArticle.set_id == set_id)
    )
    return result.one_or_none()


async def list_courses(db: AsyncSession, user_id: UUID) -> list[Course]:
    return list(
        (
            await db.scalars(
                select(Course)
                .where(Course.owner_id == user_id)
                .order_by(Course.updated_at.desc(), Course.id)
            )
        ).all()
    )


async def get_article_for_set(db: AsyncSession, set_id: UUID) -> CourseArticle | None:
    return (await db.scalars(select(CourseArticle).where(CourseArticle.set_id == set_id))).first()


async def sections(db: AsyncSession, course_id: UUID) -> list[CourseSection]:
    return list(
        (
            await db.scalars(
                select(CourseSection)
                .where(CourseSection.course_id == course_id)
                .order_by(CourseSection.position)
            )
        ).all()
    )


async def articles(db: AsyncSession, course_id: UUID) -> list[CourseArticle]:
    return list(
        (
            await db.scalars(
                select(CourseArticle)
                .join(CourseSection)
                .where(CourseSection.course_id == course_id)
                .order_by(CourseArticle.position)
            )
        ).all()
    )
