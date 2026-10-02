"""Агрегаты административной панели без решений о правах доступа."""

from __future__ import annotations

from contextlib import suppress
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from app.models.content import StudySet
from app.models.courses import Course
from app.models.moderation import CourseReport, ReportStatus
from app.models.study import Review
from app.models.user import User


@dataclass(frozen=True)
class OverviewRecord:
    users_total: int
    users_new_7d: int
    users_active_7d: int
    reviews_7d: int
    sets_total: int
    courses_total: int
    courses_published: int
    reports_open: int


@dataclass(frozen=True)
class UserRecord:
    user: User
    last_active_at: datetime | None
    sets_count: int
    courses_count: int
    reviews_count: int


async def overview(db: AsyncSession, *, now: datetime | None = None) -> OverviewRecord:
    since = (now or datetime.now(UTC)) - timedelta(days=7)
    query = select(
        select(func.count(User.id)).scalar_subquery(),
        select(func.count(User.id)).where(User.created_at >= since).scalar_subquery(),
        select(func.count(func.distinct(Review.user_id)))
        .where(Review.reviewed_at >= since)
        .scalar_subquery(),
        select(func.count(Review.id)).where(Review.reviewed_at >= since).scalar_subquery(),
        select(func.count(StudySet.id)).where(StudySet.deleted_at.is_(None)).scalar_subquery(),
        select(func.count(Course.id)).scalar_subquery(),
        select(func.count(Course.id)).where(Course.is_published.is_(True)).scalar_subquery(),
        select(func.count(CourseReport.id))
        .where(CourseReport.status == ReportStatus.open.value)
        .scalar_subquery(),
    )
    row = (await db.execute(query)).one()
    return OverviewRecord(*(int(value or 0) for value in row))


def _search_filter(query: str) -> ColumnElement[bool]:
    escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    conditions: list[ColumnElement[bool]] = [
        User.username.ilike(f"%{escaped}%", escape="\\"),
        User.email.ilike(f"%{escaped}%", escape="\\"),
        User.display_name.ilike(f"%{escaped}%", escape="\\"),
    ]
    with suppress(ValueError):
        conditions.append(User.id == UUID(query))
    return or_(*conditions)


async def users(
    db: AsyncSession,
    *,
    query: str | None,
    offset: int,
    limit: int,
) -> tuple[list[UserRecord], int]:
    filters = [_search_filter(query)] if query else []
    total = int((await db.scalar(select(func.count(User.id)).where(*filters))) or 0)

    set_counts = (
        select(
            StudySet.owner_id.label("user_id"),
            func.count(StudySet.id).label("sets_count"),
        )
        .where(StudySet.deleted_at.is_(None))
        .group_by(StudySet.owner_id)
        .subquery()
    )
    course_counts = (
        select(
            Course.owner_id.label("user_id"),
            func.count(Course.id).label("courses_count"),
        )
        .group_by(Course.owner_id)
        .subquery()
    )
    review_counts = (
        select(
            Review.user_id.label("user_id"),
            func.count(Review.id).label("reviews_count"),
            func.max(Review.reviewed_at).label("last_active_at"),
        )
        .group_by(Review.user_id)
        .subquery()
    )
    result = await db.execute(
        select(
            User,
            review_counts.c.last_active_at,
            func.coalesce(set_counts.c.sets_count, 0),
            func.coalesce(course_counts.c.courses_count, 0),
            func.coalesce(review_counts.c.reviews_count, 0),
        )
        .outerjoin(set_counts, set_counts.c.user_id == User.id)
        .outerjoin(course_counts, course_counts.c.user_id == User.id)
        .outerjoin(review_counts, review_counts.c.user_id == User.id)
        .where(*filters)
        .order_by(User.created_at.desc(), User.id.desc())
        .offset(offset)
        .limit(limit)
    )
    items = [
        UserRecord(
            user=row[0],
            last_active_at=row[1],
            sets_count=int(row[2]),
            courses_count=int(row[3]),
            reviews_count=int(row[4]),
        )
        for row in result.all()
    ]
    return items, total
