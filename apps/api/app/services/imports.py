"""Оркестрация импорта файлов в принадлежащий пользователю набор."""

from collections.abc import Awaitable, Callable
from pathlib import Path
from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, ForbiddenError, NotFoundError
from app.core.storage import get_object_storage
from app.models.content import Card
from app.models.imports import ImportJob
from app.models.user import User
from app.repositories import imports as import_repo
from app.schemas.imports import AnkiImportResult
from app.services.anki_import import parse_anki
from app.services.content import ContentService
from app.services.media import MediaService


class ImportService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.content = ContentService(db)
        self.media = MediaService(db)

    async def import_anki(
        self,
        user: User,
        set_id: UUID,
        filename: str,
        payload: bytes,
        progress: Callable[[int], Awaitable[None]] | None = None,
    ) -> AnkiImportResult:
        study_set = await self.content.get_owned_set(user, set_id, with_cards=True)
        if progress:
            await progress(10)
        parsed = parse_anki(payload, filename)
        if progress:
            await progress(35)
        if not parsed.cards:
            raise ConflictError("В файле не найдено карточек с двумя заполненными сторонами")
        if len(study_set.cards) + len(parsed.cards) > 5_000:
            raise ConflictError("В одном наборе может быть не больше 5000 карточек")

        assets = {}
        total_media = max(1, len(parsed.media))
        for index, (name, image) in enumerate(parsed.media.items(), start=1):
            assets[name] = await self.media.import_image(user, name, image)
            if progress:
                await progress(35 + round(index / total_media * 35))
        start = len(study_set.cards)
        for offset, imported in enumerate(parsed.cards):
            self.db.add(
                Card(
                    set_id=study_set.id,
                    position=start + offset,
                    term=imported.term,
                    definition=imported.definition,
                    term_image_id=(
                        assets[imported.term_image].id if imported.term_image in assets else None
                    ),
                    definition_image_id=(
                        assets[imported.definition_image].id
                        if imported.definition_image in assets
                        else None
                    ),
                )
            )
        study_set.cards_count += len(parsed.cards)
        await self.db.flush()
        if progress:
            await progress(95)
        return AnkiImportResult(
            imported_cards=len(parsed.cards),
            imported_images=len(assets),
            skipped_notes=parsed.skipped_notes,
            skipped_media=parsed.skipped_media,
            warnings=parsed.warnings or [],
            errors=parsed.errors or [],
        )

    async def create_job(
        self, user: User, set_id: UUID, filename: str, payload: bytes
    ) -> ImportJob:
        await self.content.get_owned_set(user, set_id)
        job_id = uuid4()
        suffix = Path(filename).suffix.lower()
        storage_key = f"users/{user.id}/imports/{job_id}{suffix}"
        await get_object_storage().put(storage_key, payload, "application/octet-stream")
        job = ImportJob(
            id=job_id,
            user_id=user.id,
            set_id=set_id,
            filename=filename,
            storage_key=storage_key,
        )
        self.db.add(job)
        await self.db.flush()
        return job

    async def get_job(self, user: User, job_id: UUID) -> ImportJob:
        job = await import_repo.get_job(self.db, job_id)
        if job is None:
            raise NotFoundError("Задание импорта не найдено")
        if job.user_id != user.id:
            raise ForbiddenError("Нет доступа к этому заданию импорта")
        return job

    async def list_jobs(self, user: User, set_id: UUID) -> list[ImportJob]:
        await self.content.get_owned_set(user, set_id)
        return await import_repo.list_set_jobs(self.db, user.id, set_id)
