"""Доступ к жалобам без решений о правах пользователя."""

from datetime import datetime
from typing import cast
from uuid import UUID

from sqlalchemy import Row, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.models.admin_security import AdminAuditLog
from app.models.courses import Course
from app.models.moderation import CourseReport, ReportStatus
from app.models.user import User


async def get_report(db: AsyncSession, report_id: UUID) -> CourseReport | None:
    return await db.get(CourseReport, report_id)


async def get_report_for_update(db: AsyncSession, report_id: UUID) -> CourseReport | None:
    return cast(
        CourseReport | None,
        await db.scalar(
            select(CourseReport).where(CourseReport.id == report_id).with_for_update()
        ),
    )


async def has_open_report(db: AsyncSession, course_id: UUID, reporter_id: UUID) -> bool:
    return (
        await db.scalar(
            select(CourseReport.id).where(
                CourseReport.course_id == course_id,
                CourseReport.reporter_id == reporter_id,
                CourseReport.status == ReportStatus.open.value,
            )
        )
    ) is not None


async def add_report(
    db: AsyncSession, course_id: UUID, reporter_id: UUID, reason: str, comment: str
) -> CourseReport:
    report = CourseReport(
        course_id=course_id, reporter_id=reporter_id, reason=reason, comment=comment
    )
    db.add(report)
    await db.flush()
    await db.refresh(report)
    return report


async def queue(
    db: AsyncSession, status: ReportStatus | None, *, offset: int, limit: int
) -> list[Row[tuple[CourseReport, Course, str]]]:
    """Очередь модератора: жалоба вместе с курсом и автором сигнала."""
    query = (
        select(CourseReport, Course, User.username)
        .join(Course, Course.id == CourseReport.course_id)
        .join(User, User.id == CourseReport.reporter_id)
        # Открытые сначала: разбирать очередь удобнее от старых к новым.
        .order_by(CourseReport.created_at, CourseReport.id)
        .offset(offset)
        .limit(limit)
    )
    if status is not None:
        query = query.where(CourseReport.status == status.value)
    return list((await db.execute(query)).all())


async def admin_reports(
    db: AsyncSession,
    *,
    status: ReportStatus | None,
    query: str | None,
    offset: int,
    limit: int,
) -> tuple[list[Row[tuple[CourseReport, Course, str, UUID, str]]], int]:
    reporter = aliased(User)
    author = aliased(User)
    filters = []
    if status is not None:
        filters.append(CourseReport.status == status.value)
    if query:
        pattern = f"%{query}%"
        filters.append(
            or_(
                Course.title.ilike(pattern),
                Course.slug.ilike(pattern),
                reporter.username.ilike(pattern),
                author.username.ilike(pattern),
                CourseReport.comment.ilike(pattern),
            )
        )
    base = (
        select(CourseReport, Course, reporter.username, author.id, author.username)
        .join(Course, Course.id == CourseReport.course_id)
        .join(reporter, reporter.id == CourseReport.reporter_id)
        .join(author, author.id == Course.owner_id)
        .where(*filters)
    )
    total = int(
        (
            await db.scalar(
                select(func.count()).select_from(base.order_by(None).subquery())
            )
        )
        or 0
    )
    rows = await db.execute(
        base.order_by(CourseReport.created_at.desc(), CourseReport.id.desc())
        .offset(offset)
        .limit(limit)
    )
    return list(rows.all()), total


async def admin_courses(
    db: AsyncSession,
    *,
    query: str | None,
    moderation_status: str | None,
    published: bool | None,
    offset: int,
    limit: int,
) -> tuple[list[tuple[Course, UUID, str, int, int, datetime | None]], int]:
    report_total = (
        select(func.count(CourseReport.id))
        .where(CourseReport.course_id == Course.id)
        .correlate(Course)
        .scalar_subquery()
    )
    report_open = (
        select(func.count(CourseReport.id))
        .where(
            CourseReport.course_id == Course.id,
            CourseReport.status == ReportStatus.open.value,
        )
        .correlate(Course)
        .scalar_subquery()
    )
    last_report = (
        select(func.max(CourseReport.created_at))
        .where(CourseReport.course_id == Course.id)
        .correlate(Course)
        .scalar_subquery()
    )
    filters = []
    if query:
        pattern = f"%{query}%"
        filters.append(
            or_(
                Course.title.ilike(pattern),
                Course.slug.ilike(pattern),
                User.username.ilike(pattern),
            )
        )
    if moderation_status:
        filters.append(Course.moderation_status == moderation_status)
    if published is not None:
        filters.append(Course.is_published.is_(published))
    total = int(
        (
            await db.scalar(
                select(func.count(Course.id)).join(User, User.id == Course.owner_id).where(*filters)
            )
        )
        or 0
    )
    rows = await db.execute(
        select(
            Course,
            User.id,
            User.username,
            report_total,
            report_open,
            last_report,
        )
        .join(User, User.id == Course.owner_id)
        .where(*filters)
        .order_by(report_open.desc(), Course.updated_at.desc(), Course.id.desc())
        .offset(offset)
        .limit(limit)
    )
    return [
        (row[0], row[1], row[2], int(row[3] or 0), int(row[4] or 0), row[5])
        for row in rows.all()
    ], total


async def admin_course(
    db: AsyncSession, course_id: UUID, *, for_update: bool = False
) -> tuple[Course, User] | None:
    query = (
        select(Course, User)
        .join(User, User.id == Course.owner_id)
        .where(Course.id == course_id)
    )
    if for_update:
        query = query.with_for_update(of=Course)
    row = (await db.execute(query)).one_or_none()
    return (row[0], row[1]) if row else None


async def reports_for_course(
    db: AsyncSession, course_id: UUID
) -> list[Row[tuple[CourseReport, Course, str, UUID, str]]]:
    reporter = aliased(User)
    author = aliased(User)
    rows = await db.execute(
        select(CourseReport, Course, reporter.username, author.id, author.username)
        .join(Course, Course.id == CourseReport.course_id)
        .join(reporter, reporter.id == CourseReport.reporter_id)
        .join(author, author.id == Course.owner_id)
        .where(Course.id == course_id)
        .order_by(CourseReport.created_at.desc(), CourseReport.id.desc())
    )
    return list(rows.all())


async def course_history(
    db: AsyncSession, course_id: UUID
) -> list[tuple[AdminAuditLog, str | None]]:
    rows = await db.execute(
        select(AdminAuditLog, User.username)
        .outerjoin(User, User.id == AdminAuditLog.actor_user_id)
        .where(AdminAuditLog.target_type == "course", AdminAuditLog.target_id == course_id)
        .order_by(AdminAuditLog.created_at.desc(), AdminAuditLog.id.desc())
    )
    return [(row[0], row[1]) for row in rows.all()]
