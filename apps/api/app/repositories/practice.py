"""Запросы прогресса автономных тренажёров."""

from uuid import UUID

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.practice import PythonPracticeProgress


async def list_python_progress(
    db: AsyncSession, user_id: UUID
) -> list[PythonPracticeProgress]:
    rows = await db.scalars(
        select(PythonPracticeProgress)
        .where(PythonPracticeProgress.user_id == user_id)
        .order_by(PythonPracticeProgress.task_id, PythonPracticeProgress.task_version)
    )
    return list(rows.all())


async def python_progress_for_update(
    db: AsyncSession, user_id: UUID, task_id: str, task_version: int
) -> PythonPracticeProgress | None:
    # Блокировка по логическому ключу закрывает гонку до появления первой строки.
    await db.execute(
        text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"),
        {"key": f"python-practice:{user_id}:{task_id}:{task_version}"},
    )
    rows = await db.scalars(
        select(PythonPracticeProgress)
        .where(
            PythonPracticeProgress.user_id == user_id,
            PythonPracticeProgress.task_id == task_id,
            PythonPracticeProgress.task_version == task_version,
        )
        .with_for_update()
    )
    return rows.one_or_none()
