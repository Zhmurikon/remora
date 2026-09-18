from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, NotFoundError
from app.core.storage import get_object_storage
from app.models.transcriptions import TranscriptionJob, TranscriptionStatus
from app.schemas.transcriptions import TranscriptionCreate

PART_BYTES = 16 * 1024 * 1024


class TranscriptionService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create(self, body: TranscriptionCreate) -> TranscriptionJob:
        job = TranscriptionJob(**body.model_dump())
        self.db.add(job)
        await self.db.flush()
        return job

    async def get(self, job_id: UUID) -> TranscriptionJob:
        job = await self.db.get(TranscriptionJob, job_id)
        if job is None:
            raise NotFoundError("Задание расшифровки не найдено")
        return job

    async def put_part(self, job_id: UUID, part: int, payload: bytes) -> TranscriptionJob:
        job = await self.get(job_id)
        if job.status != TranscriptionStatus.uploading:
            raise ConflictError("Загрузка этого файла уже завершена")
        if part < job.uploaded_parts:
            return job
        if part != job.uploaded_parts:
            raise ConflictError("Части файла нужно загружать по порядку")
        expected = min(PART_BYTES, job.size_bytes - part * PART_BYTES)
        if len(payload) != expected:
            raise ConflictError("Размер части файла не совпадает с ожидаемым")
        await get_object_storage().put(
            f"transcriptions/{job.id}/parts/{part:04d}", payload, "application/octet-stream"
        )
        job.uploaded_parts += 1
        await self.db.flush()
        return job

    async def complete(self, job_id: UUID) -> TranscriptionJob:
        job = await self.get(job_id)
        if job.status != TranscriptionStatus.uploading:
            return job
        if job.uploaded_parts != job.total_parts:
            raise ConflictError("Не все части файла загружены")
        job.status = TranscriptionStatus.queued
        await self.db.flush()
        return job

