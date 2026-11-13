from datetime import datetime
from uuid import UUID

from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.generations import GenerationJob
from app.models.user import User, UserStatus


def _public_notes() -> Select[tuple[GenerationJob]]:
    return (
        select(GenerationJob)
        .join(User, User.id == GenerationJob.user_id)
        .where(
            GenerationJob.kind == "notes",
            GenerationJob.status == "completed",
            GenerationJob.is_public.is_(True),
            GenerationJob.markdown.is_not(None),
            User.status == UserStatus.active,
            User.deleted_at.is_(None),
        )
    )


async def shared_note(db: AsyncSession, job_id: UUID) -> tuple[str, str] | None:
    query = _public_notes().with_only_columns(GenerationJob.title, GenerationJob.markdown)
    row = (await db.execute(query.where(GenerationJob.id == job_id))).one_or_none()
    return (row[0], row[1]) if row and row[1] is not None else None


async def public_note_entries(db: AsyncSession) -> list[tuple[UUID, datetime]]:
    query = _public_notes().with_only_columns(GenerationJob.id, GenerationJob.updated_at)
    return [(key, updated) for key, updated in await db.execute(query.order_by(GenerationJob.id))]


async def get(
    db: AsyncSession, user_id: UUID, job_id: UUID, *, lock: bool = False
) -> GenerationJob | None:
    statement = select(GenerationJob).where(
        GenerationJob.id == job_id, GenerationJob.user_id == user_id
    )
    if lock:
        statement = statement.with_for_update()
    result: GenerationJob | None = await db.scalar(
        statement.execution_options(populate_existing=True)
    )
    return result


async def list_for_source(
    db: AsyncSession, user_id: UUID, transcription_id: UUID
) -> list[GenerationJob]:
    return list(
        (
            await db.scalars(
                select(GenerationJob)
                .where(
                    GenerationJob.user_id == user_id,
                    GenerationJob.transcription_id == transcription_id,
                )
                .order_by(GenerationJob.created_at.desc())
            )
        ).all()
    )


async def by_request(db: AsyncSession, user_id: UUID, request_id: UUID) -> GenerationJob | None:
    result: GenerationJob | None = await db.scalar(
        select(GenerationJob).where(
            GenerationJob.user_id == user_id, GenerationJob.request_id == request_id
        )
    )
    return result
