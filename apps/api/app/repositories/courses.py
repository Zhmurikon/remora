"""Доступ к структуре курсов без решений о правах пользователя."""

from datetime import datetime
from uuid import UUID

from sqlalchemy import delete, exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.content import Card, StudySet
from app.models.courses import Course, CourseArticle, CourseLike, CourseSection, LibrarySave
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


async def sitemap_entries(db: AsyncSession) -> list[tuple[str, str, datetime]]:
    valid_card = (
        select(Card.id)
        .join(StudySet, StudySet.id == Card.set_id)
        .join(CourseArticle, CourseArticle.set_id == StudySet.id)
        .join(CourseSection, CourseSection.id == CourseArticle.section_id)
        .where(CourseSection.course_id == Course.id, StudySet.deleted_at.is_(None))
        .correlate(Course)
    )
    rows = await db.execute(
        select(Course.slug, User.username, Course.updated_at)
        .join(User, User.id == Course.owner_id)
        .where(
            Course.is_published.is_(True),
            Course.is_listed.is_(True),
            Course.moderation_status != "blocked",
            User.status == UserStatus.active,
            User.deleted_at.is_(None),
            exists(valid_card),
        )
        .order_by(Course.id)
    )
    return [(slug, username, updated_at) for slug, username, updated_at in rows]


async def course_for_set(db: AsyncSession, set_id: UUID) -> Course | None:
    result = await db.scalars(
        select(Course).join(CourseSection).join(CourseArticle).where(CourseArticle.set_id == set_id)
    )
    return result.one_or_none()


async def list_courses(
    db: AsyncSession, user_id: UUID, *, offset: int = 0, limit: int | None = None
) -> list[Course]:
    return list(
        (
            await db.scalars(
                select(Course)
                .where(Course.owner_id == user_id)
                .order_by(Course.updated_at.desc(), Course.id)
                .offset(offset)
                .limit(limit)
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


async def related_course_ids(db: AsyncSession, course: Course, limit: int = 50) -> list[UUID]:
    if not course.tags:
        return []
    return list(
        await db.scalars(
            select(Course.id)
            .where(
                Course.id != course.id,
                Course.tags.overlap(course.tags),
            )
            .order_by(Course.updated_at.desc())
            .limit(limit)
        )
    )


async def likes_count(db: AsyncSession, course_id: UUID) -> int:
    return int(
        await db.scalar(
            select(func.count()).select_from(CourseLike).where(CourseLike.course_id == course_id)
        )
        or 0
    )


async def saves_count(db: AsyncSession, course_id: UUID) -> int:
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
        .where(or_(LibrarySave.course_id == course_id, CourseSection.course_id == course_id))
    )
    return int(value or 0)


async def is_liked(db: AsyncSession, course_id: UUID, user_id: UUID) -> bool:
    return (
        await db.scalar(
            select(CourseLike.id).where(
                CourseLike.course_id == course_id, CourseLike.user_id == user_id
            )
        )
    ) is not None


async def add_like(db: AsyncSession, course_id: UUID, user_id: UUID) -> None:
    if not await is_liked(db, course_id, user_id):
        db.add(CourseLike(course_id=course_id, user_id=user_id))
        await db.flush()


async def remove_like(db: AsyncSession, course_id: UUID, user_id: UUID) -> None:
    await db.execute(
        delete(CourseLike).where(CourseLike.course_id == course_id, CourseLike.user_id == user_id)
    )
