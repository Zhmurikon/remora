"""Доступ к жалобам без решений о правах пользователя."""

from uuid import UUID

from sqlalchemy import Row, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.courses import Course
from app.models.moderation import AuditLog, CourseReport, ModerationAction, ReportStatus
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


async def course_queue(
    db: AsyncSession, *, offset: int, limit: int
) -> list[Row[tuple[Course, User, int]]]:
    open_reports = func.count(CourseReport.id).filter(
        CourseReport.status == ReportStatus.open.value
    )
    query = (
        select(Course, User, open_reports.label("open_reports"))
        .join(User, User.id == Course.owner_id)
        .outerjoin(CourseReport, CourseReport.course_id == Course.id)
        .where(Course.is_published.is_(True))
        .group_by(Course.id, User.id)
        .order_by(open_reports.desc(), Course.created_at, Course.id)
        .offset(offset)
        .limit(limit)
    )
    return list((await db.execute(query)).all())


async def moderation_history(
    db: AsyncSession, *, offset: int, limit: int
) -> list[ModerationAction]:
    return list(
        (
            await db.scalars(
                select(ModerationAction)
                .order_by(ModerationAction.created_at.desc(), ModerationAction.id.desc())
                .offset(offset)
                .limit(limit)
            )
        ).all()
    )


async def audit_history(db: AsyncSession, *, offset: int, limit: int) -> list[AuditLog]:
    return list(
        (
            await db.scalars(
                select(AuditLog)
                .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
                .offset(offset)
                .limit(limit)
            )
        ).all()
    )


async def warnings_for_owner(db: AsyncSession, user_id: UUID) -> list[ModerationAction]:
    return list(
        (
            await db.scalars(
                select(ModerationAction)
                .join(
                    Course,
                    (ModerationAction.target_type == "course")
                    & (Course.id == ModerationAction.target_id),
                )
                .where(Course.owner_id == user_id, ModerationAction.action == "warn")
                .order_by(ModerationAction.created_at.desc())
            )
        ).all()
    )
