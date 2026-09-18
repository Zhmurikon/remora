"""Личная библиотека связанных публичных оригиналов."""

from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.library import LibraryDiff, LibraryItem, LibrarySaveCreate, LibraryState
from app.services.library import LibraryService

router = APIRouter(prefix="/library", tags=["library"])


@router.get("", response_model=list[LibraryItem], summary="Сохранённые оригиналы")
async def list_library(
    user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> list[LibraryItem]:
    return await LibraryService(db).list(user)


@router.post("", response_model=LibraryItem, status_code=201, summary="Сохранить оригинал")
async def save_to_library(
    body: LibrarySaveCreate,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> LibraryItem:
    return await LibraryService(db).save(user, body)


@router.delete("/{save_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Убрать сохранение")
async def remove_from_library(
    save_id: UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> None:
    await LibraryService(db).remove(user, save_id)


@router.get("/{save_id}/changes", response_model=LibraryDiff, summary="Изменения оригинала")
async def library_changes(
    save_id: UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> LibraryDiff:
    return await LibraryService(db).diff(user, save_id)


@router.post("/{save_id}/accept", response_model=LibraryItem, summary="Принять обновление")
async def accept_library_update(
    save_id: UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> LibraryItem:
    return await LibraryService(db).accept_update(user, save_id)


@router.get("/courses/{slug}/state", response_model=LibraryState)
async def course_library_state(
    slug: str, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> LibraryState:
    return await LibraryService(db).state(user, slug)
