"""Запросы метаданных вложений без решений о доступе."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.courses import CourseAttachment


async def get(db: AsyncSession, attachment_id: UUID) -> CourseAttachment | None:
    return await db.get(CourseAttachment, attachment_id)


async def list_for_course(db: AsyncSession, course_id: UUID) -> list[CourseAttachment]:
    return list(
        (
            await db.scalars(
                select(CourseAttachment)
                .where(CourseAttachment.course_id == course_id)
                .order_by(CourseAttachment.created_at, CourseAttachment.id)
            )
        ).all()
    )
