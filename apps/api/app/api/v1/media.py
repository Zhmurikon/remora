"""Прямая загрузка изображений в S3 и управление ими."""

from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.media import ImageUploadRequest, ImageUploadTicket, MediaAssetPublic
from app.services.media import MediaService

router = APIRouter(prefix="/media", tags=["media"])


@router.post(
    "/upload-url",
    response_model=ImageUploadTicket,
    status_code=status.HTTP_201_CREATED,
    summary="Получить ссылку для загрузки изображения",
)
async def create_upload_url(
    body: ImageUploadRequest,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> ImageUploadTicket:
    return await MediaService(db).create_image_upload(user, body)


@router.post("/{asset_id}/complete", response_model=MediaAssetPublic, summary="Завершить загрузку")
async def complete_upload(
    asset_id: UUID,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> MediaAssetPublic:
    return await MediaService(db).complete_image_upload(user, asset_id)


@router.get("/{asset_id}", response_model=MediaAssetPublic, summary="Получить изображение")
async def get_asset(
    asset_id: UUID,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> MediaAssetPublic:
    return await MediaService(db).get_asset(user, asset_id)


@router.delete("/{asset_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Удалить изображение")
async def delete_asset(
    asset_id: UUID,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await MediaService(db).delete_asset(user, asset_id)
