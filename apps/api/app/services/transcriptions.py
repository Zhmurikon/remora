from math import ceil
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, NotFoundError, ValidationError
from app.core.storage import get_object_storage
from app.models.transcriptions import TranscriptionJob, TranscriptionProvider, TranscriptionStatus
from app.models.user import User
from app.schemas.transcriptions import (
    TranscriptionCreate,
    TranscriptionUpdate,
    UserTranscriptionCreate,
)
from app.services.entitlements import Entitlements, week_period

PART_BYTES = 16 * 1024 * 1024


class TranscriptionService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create(self, body: TranscriptionCreate) -> TranscriptionJob:
        job = TranscriptionJob(**body.model_dump())
        self.db.add(job)
        await self.db.flush()
        return job

    async def create_for_user(
        self, user: User, body: UserTranscriptionCreate
    ) -> TranscriptionJob:
        if body.total_parts != ceil(body.size_bytes / PART_BYTES):
            raise ValidationError("Количество частей файла не соответствует его размеру")
        quota_minutes = ceil(body.duration_seconds / 60)
        period_key, resets_at = week_period()
        await Entitlements(self.db).consume(
            user,
            "ai.transcription_minutes_per_week",
            amount=quota_minutes,
            period_key=period_key,
            resets_at=resets_at,
            counter_metric="ai_transcription_minutes",
        )
        job = TranscriptionJob(
            user_id=user.id,
            filename=body.filename,
            title=self.default_title(body.filename),
            content_type=body.content_type,
            size_bytes=body.size_bytes,
            total_parts=body.total_parts,
            duration_seconds=body.duration_seconds,
            quota_minutes=quota_minutes,
            quota_period_key=period_key,
            provider=TranscriptionProvider.yandex_speechkit,
            language=body.language,
        )
        self.db.add(job)
        await self.db.flush()
        return job

    async def get(self, job_id: UUID) -> TranscriptionJob:
        job = await self.db.get(TranscriptionJob, job_id)
        if job is None:
            raise NotFoundError("Задание расшифровки не найдено")
        return job

    async def get_for_user(self, user: User, job_id: UUID) -> TranscriptionJob:
        job = await self.db.scalar(
            select(TranscriptionJob).where(
                TranscriptionJob.id == job_id, TranscriptionJob.user_id == user.id
            )
        )
        if job is None:
            raise NotFoundError("Расшифровка не найдена")
        return job

    async def list_for_user(self, user: User) -> list[TranscriptionJob]:
        return list(
            (
                await self.db.scalars(
                    select(TranscriptionJob)
                    .where(TranscriptionJob.user_id == user.id)
                    .order_by(TranscriptionJob.created_at.desc())
                )
            ).all()
        )

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

    async def update_for_user(
        self, user: User, job_id: UUID, body: TranscriptionUpdate
    ) -> TranscriptionJob:
        job = await self.get_for_user(user, job_id)
        if "result_text" in body.model_fields_set and job.status != TranscriptionStatus.completed:
            raise ConflictError("Редактировать можно только готовую расшифровку")
        if "title" in body.model_fields_set:
            job.title = body.title
        if "result_text" in body.model_fields_set:
            job.result_text = body.result_text
        await self.db.flush()
        return job

    async def delete_for_user(self, user: User, job_id: UUID) -> None:
        job = await self.get_for_user(user, job_id)
        if job.status in {TranscriptionStatus.converting, TranscriptionStatus.transcribing}:
            raise ConflictError("Дождитесь завершения обработки перед удалением")
        if job.status in {
            TranscriptionStatus.uploading,
            TranscriptionStatus.queued,
            TranscriptionStatus.failed,
        }:
            await self.release_quota(user, job)
        await get_object_storage().delete_many(
            [f"transcriptions/{job.id}/parts/{part:04d}" for part in range(job.total_parts)]
        )
        await self.db.delete(job)
        await self.db.flush()

    async def release_quota(self, user: User, job: TranscriptionJob) -> None:
        if job.quota_released or not job.quota_minutes or not job.quota_period_key:
            return
        await Entitlements(self.db).release(
            user,
            "ai.transcription_minutes_per_week",
            amount=job.quota_minutes,
            period_key=job.quota_period_key,
            counter_metric="ai_transcription_minutes",
        )
        job.quota_released = True
        await self.db.flush()

    @staticmethod
    def default_title(filename: str) -> str:
        stem = filename.rsplit("/", 1)[-1].rsplit(".", 1)[0].strip()
        return stem or "Новая расшифровка"
