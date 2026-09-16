"""Хранение и выборка фоновых импортов."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.imports import ImportJob


async def get_job(db: AsyncSession, job_id: UUID) -> ImportJob | None:
    return await db.get(ImportJob, job_id)


async def list_set_jobs(
    db: AsyncSession, user_id: UUID, set_id: UUID, limit: int = 20
) -> list[ImportJob]:
    rows = await db.scalars(
        select(ImportJob)
        .where(ImportJob.user_id == user_id, ImportJob.set_id == set_id)
        .order_by(ImportJob.created_at.desc())
        .limit(limit)
    )
    return list(rows.all())
