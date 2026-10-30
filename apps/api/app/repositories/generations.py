from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.generations import GenerationJob


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
