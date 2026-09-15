"""Хранение метаданных загруженных файлов."""

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.content import MediaAsset


async def get_asset(db: AsyncSession, asset_id: UUID) -> MediaAsset | None:
    return await db.get(MediaAsset, asset_id)
