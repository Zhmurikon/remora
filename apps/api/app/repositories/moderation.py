"""Доступ к жалобам без решений о правах пользователя."""

from uuid import UUID

from sqlalchemy import Row, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.courses import Course
from app.models.moderation import CourseReport, ReportStatus
from app.models.user import User


async def get_report(db: AsyncSession, report_id: UUID) -> CourseReport | None:
    return await db.get(CourseReport, report_id)


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
