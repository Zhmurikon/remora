"""Выдача временных ссылок и проверка загруженных изображений."""

import hashlib
from io import BytesIO
from pathlib import Path
from uuid import UUID, uuid4

from botocore.exceptions import BotoCoreError, ClientError
from PIL import Image, UnidentifiedImageError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import ConflictError, ForbiddenError, NotFoundError
from app.core.storage import get_object_storage
from app.models.content import MediaAsset, MediaKind, MediaSource, MediaStatus
from app.models.user import User
from app.repositories import media as media_repo
from app.schemas.media import ImageUploadRequest, ImageUploadTicket, MediaAssetPublic

ALLOWED_IMAGE_MIMES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
FORMAT_MIMES = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp", "GIF": "image/gif"}


class MediaService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.settings = get_settings()

    async def create_image_upload(self, user: User, body: ImageUploadRequest) -> ImageUploadTicket:
        if body.mime not in ALLOWED_IMAGE_MIMES:
            raise ConflictError("Поддерживаются JPEG, PNG, WebP и GIF")
        if body.size_bytes > self.settings.media_image_max_size_bytes:
            raise ConflictError(
                "Изображение слишком большое",
                details={"max_size_bytes": self.settings.media_image_max_size_bytes},
            )
        asset_id = uuid4()
        suffix = Path(body.filename).suffix.lower()[:10]
        key = f"users/{user.id}/images/{asset_id}{suffix}"
        asset = MediaAsset(
            id=asset_id,
            owner_id=user.id,
            kind=MediaKind.image,
            s3_key=key,
            mime=body.mime,
            size_bytes=body.size_bytes,
            source=MediaSource.upload,
            status=MediaStatus.pending,
        )
        self.db.add(asset)
        await self.db.flush()
        storage = get_object_storage()
        return ImageUploadTicket(
            id=asset.id,
            upload_url=storage.upload_url(
                asset.s3_key, asset.mime, self.settings.media_upload_ttl_seconds
            ),
            headers={"Content-Type": asset.mime},
            expires_in=self.settings.media_upload_ttl_seconds,
        )

    async def complete_image_upload(self, user: User, asset_id: UUID) -> MediaAssetPublic:
        asset = await self._owned_asset(user, asset_id)
        if asset.status == MediaStatus.ready:
            return self._public(asset)
        try:
            payload, actual_size = await get_object_storage().read(
                asset.s3_key, self.settings.media_image_max_size_bytes
            )
        except ValueError as exc:
            await self._reject(asset)
            raise ConflictError("Изображение слишком большое") from exc
        except (BotoCoreError, ClientError) as exc:
            raise ConflictError("Файл ещё не загружен") from exc
        if actual_size > self.settings.media_image_max_size_bytes:
            await self._reject(asset)
            raise ConflictError("Изображение слишком большое")
        try:
            width, height, mime = _inspect_image(payload, self.settings.media_image_max_pixels)
        except (UnidentifiedImageError, OSError, ValueError) as exc:
            await self._reject(asset)
            raise ConflictError("Загруженный файл не является допустимым изображением") from exc
        if width * height > self.settings.media_image_max_pixels:
            await self._reject(asset)
            raise ConflictError("У изображения слишком большое разрешение")
        asset.mime = mime
        asset.size_bytes = actual_size
        asset.width = width
        asset.height = height
        asset.checksum = hashlib.sha256(payload).hexdigest()
        asset.status = MediaStatus.ready
        await self.db.flush()
        return self._public(asset)

    async def get_asset(self, user: User, asset_id: UUID) -> MediaAssetPublic:
        return self._public(await self._owned_asset(user, asset_id))

    async def delete_asset(self, user: User, asset_id: UUID) -> None:
        asset = await self._owned_asset(user, asset_id)
        await get_object_storage().delete(asset.s3_key)
        await self.db.delete(asset)
        await self.db.flush()

    async def _owned_asset(self, user: User, asset_id: UUID) -> MediaAsset:
        asset = await media_repo.get_asset(self.db, asset_id)
        if asset is None:
            raise NotFoundError("Изображение не найдено")
        if asset.owner_id != user.id:
            raise ForbiddenError("Нет доступа к этому изображению")
        return asset

    async def _reject(self, asset: MediaAsset) -> None:
        asset.status = MediaStatus.rejected
        await get_object_storage().delete(asset.s3_key)
        await self.db.flush()

    def _public(self, asset: MediaAsset) -> MediaAssetPublic:
        url = None
        if asset.status == MediaStatus.ready:
            url = get_object_storage().download_url(
                asset.s3_key, self.settings.media_download_ttl_seconds
            )
        return MediaAssetPublic(
            id=asset.id,
            mime=asset.mime,
            size_bytes=asset.size_bytes,
            width=asset.width,
            height=asset.height,
            status=asset.status,
            download_url=url,
            created_at=asset.created_at,
        )


def _inspect_image(payload: bytes, max_pixels: int) -> tuple[int, int, str]:
    with Image.open(BytesIO(payload)) as image:
        if image.width * image.height > max_pixels:
            raise ValueError("image dimensions exceed allowed size")
        image.verify()
    with Image.open(BytesIO(payload)) as image:
        mime = FORMAT_MIMES.get(image.format or "")
        if mime is None:
            raise ValueError("unsupported image format")
        return image.width, image.height, mime
