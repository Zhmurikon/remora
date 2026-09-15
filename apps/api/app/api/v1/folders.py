"""Папки пользователя для организации наборов."""

from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.content import FolderCreate, FolderPublic, FolderUpdate
from app.services.content import ContentService

router = APIRouter(prefix="/folders", tags=["folders"])


@router.get("", response_model=list[FolderPublic], summary="Мои папки")
async def list_folders(
    user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> list[FolderPublic]:
    return [
        FolderPublic.model_validate(item) for item in await ContentService(db).list_folders(user)
    ]


@router.post(
    "", response_model=FolderPublic, status_code=status.HTTP_201_CREATED, summary="Создать папку"
)
async def create_folder(
    body: FolderCreate, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> FolderPublic:
    return FolderPublic.model_validate(await ContentService(db).create_folder(user, body))


@router.patch("/{folder_id}", response_model=FolderPublic, summary="Изменить папку")
async def update_folder(
    folder_id: UUID,
    body: FolderUpdate,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> FolderPublic:
    return FolderPublic.model_validate(
        await ContentService(db).update_folder(user, folder_id, body)
    )


@router.delete("/{folder_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Удалить папку")
async def delete_folder(
    folder_id: UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> None:
    await ContentService(db).delete_folder(user, folder_id)
