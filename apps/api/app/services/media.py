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
from app.core.svg import sanitize_svg
from app.models.content import MediaAsset, MediaKind, MediaSource, MediaStatus
from app.models.user import User
from app.repositories import media as media_repo
from app.schemas.media import ImageUploadRequest, ImageUploadTicket, MediaAssetPublic

SVG_MIME = "image/svg+xml"
ALLOWED_IMAGE_MIMES = {"image/jpeg", "image/png", "image/webp", "image/gif", SVG_MIME}
FORMAT_MIMES = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp", "GIF": "image/gif"}


class MediaService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.settings = get_settings()

    async def create_image_upload(self, user: User, body: ImageUploadRequest) -> ImageUploadTicket:
        if body.mime not in ALLOWED_IMAGE_MIMES:
            raise ConflictError("Поддерживаются JPEG, PNG, WebP, GIF и SVG")
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
        storage = get_object_storage()
        try:
            payload, actual_size = await storage.read(
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
            processed, width, height, mime = _prepare_image(
                payload,
                self.settings.media_image_max_pixels,
                svg=asset.mime == SVG_MIME,
            )
        except (UnidentifiedImageError, OSError, ValueError) as exc:
            await self._reject(asset)
            raise ConflictError("Загруженный файл не является допустимым изображением") from exc
        if width * height > self.settings.media_image_max_pixels:
            await self._reject(asset)
            raise ConflictError("У изображения слишком большое разрешение")
        if processed != payload:
            # Исходный пользовательский SVG нельзя выдавать даже на короткое время.
            await storage.put(asset.s3_key, processed, mime)
        asset.mime = mime
        asset.size_bytes = len(processed)
        asset.width = width
        asset.height = height
        asset.checksum = hashlib.sha256(processed).hexdigest()
        asset.status = MediaStatus.ready
        await self.db.flush()
        return self._public(asset)

    async def import_image(
        self, user: User, filename: str, payload: bytes, *, declared_mime: str | None = None
    ) -> MediaAsset:
        """Проверяет и сохраняет картинку из доверенного серверного импортера."""
        if len(payload) > self.settings.media_image_max_size_bytes:
            raise ConflictError("Изображение из архива слишком большое")
        try:
            processed, width, height, mime = _prepare_image(
                payload,
                self.settings.media_image_max_pixels,
                svg=(
                    declared_mime == SVG_MIME
                    if declared_mime is not None
                    else Path(filename).suffix.lower() == ".svg"
                ),
            )
        except (UnidentifiedImageError, OSError, ValueError) as exc:
            raise ConflictError("В архиве найдено недопустимое изображение") from exc
        asset_id = uuid4()
        suffix = Path(filename).suffix.lower()[:10]
        key = f"users/{user.id}/images/{asset_id}{suffix}"
        checksum = hashlib.sha256(processed).hexdigest()
        asset = MediaAsset(
            id=asset_id,
            owner_id=user.id,
            kind=MediaKind.image,
            s3_key=key,
            mime=mime,
            size_bytes=len(processed),
            width=width,
            height=height,
            checksum=checksum,
            source=MediaSource.upload,
            status=MediaStatus.ready,
        )
        await get_object_storage().put(key, processed, mime)
        self.db.add(asset)
        await self.db.flush()
        return asset

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


def _prepare_image(payload: bytes, max_pixels: int, *, svg: bool) -> tuple[bytes, int, int, str]:
    if svg:
        cleaned, width, height = sanitize_svg(payload, max_pixels)
        return cleaned, width, height, SVG_MIME
    width, height, mime = _inspect_image(payload, max_pixels)
    return payload, width, height, mime
