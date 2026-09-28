"""Синхронизация прогресса встроенных тренажёров."""

from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import StringConstraints
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.practice import PythonProgressOut, PythonProgressUpdate
from app.services.practice import PracticeService

router = APIRouter(prefix="/practice", tags=["practice"])
TaskId = Annotated[str, StringConstraints(pattern=r"^[a-z0-9][a-z0-9-]{0,119}$")]


@router.get(
    "/python/progress",
    response_model=list[PythonProgressOut],
    summary="Прогресс задач Python",
)
async def list_python_progress(
    user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> list[PythonProgressOut]:
    return await PracticeService(db).list_python_progress(user)


@router.put(
    "/python/progress/{task_id}",
    response_model=PythonProgressOut,
    summary="Синхронизировать прогресс задачи Python",
)
async def merge_python_progress(
    task_id: TaskId,
    body: PythonProgressUpdate,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> PythonProgressOut:
    return await PracticeService(db).merge_python_progress(user, task_id, body)
