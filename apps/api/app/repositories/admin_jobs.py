"""Запросы административного списка фоновых операций без бизнес-логики."""

from typing import Any, cast
from uuid import UUID

from sqlalchemy import String, func, literal, or_, select, union_all
from sqlalchemy import cast as sql_cast
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.content import MediaAsset
from app.models.courses import Course, CourseSearchSync
from app.models.exports import AccountExportJob
from app.models.imports import ImportJob
from app.models.transcriptions import TranscriptionJob
from app.models.user import User


def _selects() -> list[Any]:
    return [
        select(
            literal("import").label("kind"),
            ImportJob.id.label("id"),
            sql_cast(ImportJob.status, String).label("status"),
            ImportJob.user_id.label("user_id"),
            User.username.label("username"),
            User.email.label("email"),
            literal("Импорт Anki").label("label"),
            ImportJob.progress.label("progress"),
            ImportJob.error_message.label("error"),
            ImportJob.created_at.label("created_at"),
            ImportJob.started_at.label("started_at"),
            ImportJob.finished_at.label("finished_at"),
        ).join(User, User.id == ImportJob.user_id),
        select(
            literal("export").label("kind"),
            AccountExportJob.id.label("id"),
            sql_cast(AccountExportJob.status, String).label("status"),
            AccountExportJob.user_id.label("user_id"),
            User.username.label("username"),
            User.email.label("email"),
            literal("Полный экспорт аккаунта").label("label"),
            AccountExportJob.progress.label("progress"),
            AccountExportJob.error_message.label("error"),
            AccountExportJob.created_at.label("created_at"),
            AccountExportJob.started_at.label("started_at"),
            AccountExportJob.finished_at.label("finished_at"),
        ).join(User, User.id == AccountExportJob.user_id),
        select(
            literal("transcription").label("kind"),
            TranscriptionJob.id.label("id"),
            sql_cast(TranscriptionJob.status, String).label("status"),
            literal(None).cast(User.id.type).label("user_id"),
            literal(None).cast(String).label("username"),
            literal(None).cast(String).label("email"),
            literal("Расшифровка медиа").label("label"),
            literal(None).cast(ImportJob.progress.type).label("progress"),
            TranscriptionJob.error_message.label("error"),
            TranscriptionJob.created_at.label("created_at"),
            TranscriptionJob.started_at.label("started_at"),
            TranscriptionJob.finished_at.label("finished_at"),
        ),
        select(
            literal("media").label("kind"),
            MediaAsset.id.label("id"),
            sql_cast(MediaAsset.status, String).label("status"),
            MediaAsset.owner_id.label("user_id"),
            User.username.label("username"),
            User.email.label("email"),
            sql_cast(MediaAsset.kind, String).label("label"),
            literal(None).cast(ImportJob.progress.type).label("progress"),
            literal(None).cast(String).label("error"),
            MediaAsset.created_at.label("created_at"),
            literal(None).cast(MediaAsset.created_at.type).label("started_at"),
            MediaAsset.updated_at.label("finished_at"),
        ).outerjoin(User, User.id == MediaAsset.owner_id),
        select(
            literal("search").label("kind"),
            CourseSearchSync.course_id.label("id"),
            literal("queued").label("status"),
            Course.owner_id.label("user_id"),
            User.username.label("username"),
            User.email.label("email"),
            literal("Синхронизация каталога").label("label"),
            literal(None).cast(ImportJob.progress.type).label("progress"),
            literal(None).cast(String).label("error"),
            CourseSearchSync.requested_at.label("created_at"),
            literal(None).cast(CourseSearchSync.requested_at.type).label("started_at"),
            literal(None).cast(CourseSearchSync.requested_at.type).label("finished_at"),
        )
        .outerjoin(Course, Course.id == CourseSearchSync.course_id)
        .outerjoin(User, User.id == Course.owner_id),
    ]


async def jobs(
    db: AsyncSession,
    *,
    query: str | None,
    kind: str | None,
    status: str | None,
    offset: int,
    limit: int,
) -> tuple[list[dict[str, Any]], int]:
    combined = union_all(*_selects()).subquery()
    filters = []
    if kind:
        filters.append(combined.c.kind == kind)
    if status:
        filters.append(combined.c.status == status)
    if query:
        escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        pattern = f"%{escaped}%"
        filters.append(
            or_(
                combined.c.username.ilike(pattern, escape="\\"),
                combined.c.email.ilike(pattern, escape="\\"),
                sql_cast(combined.c.id, String).ilike(pattern, escape="\\"),
            )
        )
    total = int(
        (await db.scalar(select(func.count()).select_from(combined).where(*filters))) or 0
    )
    rows = await db.execute(
        select(combined)
        .where(*filters)
        .order_by(combined.c.created_at.desc(), combined.c.id.desc())
        .offset(offset)
        .limit(limit)
    )
    return [dict(row._mapping) for row in rows], total


async def export_for_update(db: AsyncSession, job_id: UUID) -> AccountExportJob | None:
    return cast(
        AccountExportJob | None,
        await db.scalar(
            select(AccountExportJob).where(AccountExportJob.id == job_id).with_for_update()
        ),
    )


async def search_for_update(db: AsyncSession, job_id: UUID) -> CourseSearchSync | None:
    return cast(
        CourseSearchSync | None,
        await db.scalar(
            select(CourseSearchSync)
            .where(CourseSearchSync.course_id == job_id)
            .with_for_update()
        ),
    )
