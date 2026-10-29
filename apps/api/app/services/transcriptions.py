from datetime import UTC, datetime, timedelta
from math import ceil
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import ConflictError, NotFoundError, ValidationError
from app.core.storage import get_object_storage
from app.models.transcriptions import TranscriptionJob, TranscriptionProvider, TranscriptionStatus
from app.models.user import User
from app.schemas.transcriptions import (
    TranscriptionCreate,
    TranscriptionUpdate,
    TranscriptionUploadedPart,
    TranscriptionUploadPartUrl,
    TranscriptionUploadState,
    UserTranscriptionCreate,
)
from app.services.entitlements import Entitlements, week_period

PART_BYTES = 16 * 1024 * 1024
UPLOAD_TTL = timedelta(hours=24)


class TranscriptionService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create(self, body: TranscriptionCreate) -> TranscriptionJob:
        job = TranscriptionJob(**body.model_dump())
        self.db.add(job)
        await self.db.flush()
        return job

    async def create_for_user(self, user: User, body: UserTranscriptionCreate) -> TranscriptionJob:
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
        storage = get_object_storage()
        job.storage_key = f"transcriptions/{job.id}/source"
        job.storage_upload_id = await storage.create_multipart_upload(
            job.storage_key, job.content_type
        )
        job.upload_expires_at = datetime.now(UTC) + UPLOAD_TTL
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
        if job.storage_upload_id:
            raise ConflictError("Используйте прямую загрузку частей файла")
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

    async def upload_state(self, user: User, job_id: UUID) -> TranscriptionUploadState:
        job = await self.get_for_user(user, job_id)
        key, upload_id = self._active_multipart(job)
        parts = await get_object_storage().list_multipart_parts(key, upload_id)
        job.uploaded_parts = len(parts)
        await self.db.flush()
        return TranscriptionUploadState(
            part_size_bytes=PART_BYTES,
            total_parts=job.total_parts,
            uploaded_parts=[
                TranscriptionUploadedPart(
                    part_number=int(part["part_number"]),
                    size_bytes=int(part["size_bytes"]),
                )
                for part in parts
            ],
            expires_at=job.upload_expires_at or datetime.now(UTC),
        )

    async def sign_upload_parts(
        self, user: User, job_id: UUID, part_numbers: list[int]
    ) -> list[TranscriptionUploadPartUrl]:
        job = await self.get_for_user(user, job_id)
        key, upload_id = self._active_multipart(job)
        unique = list(dict.fromkeys(part_numbers))
        if len(unique) != len(part_numbers) or any(
            part < 1 or part > job.total_parts for part in unique
        ):
            raise ValidationError("Некорректные номера частей файла")
        ttl = get_settings().media_upload_ttl_seconds
        storage = get_object_storage()
        return [
            TranscriptionUploadPartUrl(
                part_number=part,
                url=storage.upload_part_url(key, upload_id, part, ttl),
            )
            for part in unique
        ]

    async def complete_user_upload(self, user: User, job_id: UUID) -> TranscriptionJob:
        job = await self.get_for_user(user, job_id)
        if job.status != TranscriptionStatus.uploading:
            return job
        key, upload_id = self._active_multipart(job)
        storage = get_object_storage()
        parts = sorted(
            await storage.list_multipart_parts(key, upload_id),
            key=lambda part: int(part["part_number"]),
        )
        if len(parts) != job.total_parts:
            raise ConflictError("Не все части файла загружены")
        for index, part in enumerate(parts, start=1):
            expected = min(PART_BYTES, job.size_bytes - (index - 1) * PART_BYTES)
            if int(part["part_number"]) != index or int(part["size_bytes"]) != expected:
                raise ConflictError("Размер частей файла не совпадает с ожидаемым")
        await storage.complete_multipart_upload(key, upload_id, parts)
        if await storage.size(key) != job.size_bytes:
            await storage.delete(key)
            raise ConflictError("Размер загруженного файла не совпадает с ожидаемым")
        job.storage_upload_id = None
        job.uploaded_parts = job.total_parts
        job.status = TranscriptionStatus.queued
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
        storage = get_object_storage()
        if job.storage_key and job.storage_upload_id:
            await storage.abort_multipart_upload(job.storage_key, job.storage_upload_id)
        elif job.storage_key:
            await storage.delete(job.storage_key)
        else:
            await storage.delete_many(
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

    @staticmethod
    def _active_multipart(job: TranscriptionJob) -> tuple[str, str]:
        if job.status != TranscriptionStatus.uploading:
            raise ConflictError("Загрузка этого файла уже завершена")
        if not job.storage_key or not job.storage_upload_id:
            raise ConflictError("Для задания недоступна прямая загрузка")
        if job.upload_expires_at and job.upload_expires_at <= datetime.now(UTC):
            raise ConflictError("Срок загрузки истёк")
        return job.storage_key, job.storage_upload_id
