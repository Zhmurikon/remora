"""ARQ worker для долговечных фоновых операций."""

import asyncio
import tempfile
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, ClassVar
from uuid import UUID

import httpx
from arq import cron
from arq.connections import RedisSettings
from sqlalchemy import delete, or_, select, update

from app.core.config import get_settings
from app.core.email import send_account_export_email
from app.core.errors import AppError
from app.core.storage import get_object_storage
from app.db.session import dispose_engine, get_session_factory
from app.models.exports import AccountExportJob, AccountExportStatus
from app.models.imports import ImportJob, ImportJobStatus
from app.models.transcriptions import TranscriptionJob, TranscriptionStatus
from app.models.user import User
from app.services.account_exports import AccountExportService
from app.services.imports import ImportService
from app.services.search_sync import synchronize_courses


async def _set_progress(job_id: UUID, value: int) -> None:
    async with get_session_factory()() as db:
        await db.execute(update(ImportJob).where(ImportJob.id == job_id).values(progress=value))
        await db.commit()


async def process_anki_import(_context: dict[str, Any], job_id_value: str) -> None:
    job_id = UUID(job_id_value)
    storage_key: str | None = None
    async with get_session_factory()() as db:
        job = await db.get(ImportJob, job_id)
        if job is None or job.status != ImportJobStatus.queued:
            return
        job.status = ImportJobStatus.processing
        job.started_at = datetime.now(UTC)
        job.progress = 5
        storage_key = job.storage_key
        await db.commit()

    try:
        payload, _size = await get_object_storage().read(storage_key, 100 * 1024 * 1024)
        async with get_session_factory()() as db:
            job = await db.get(ImportJob, job_id)
            if job is None:
                return
            user = await db.get(User, job.user_id)
            if user is None:
                raise RuntimeError("import user disappeared")
            result = await ImportService(db).import_anki(
                user,
                job.set_id,
                job.filename,
                payload,
                progress=lambda value: _set_progress(job_id, value),
            )
            job.status = ImportJobStatus.completed
            job.progress = 100
            job.result = result.model_dump(mode="json", exclude={"errors"})
            job.errors = [item.model_dump(mode="json") for item in result.errors]
            job.finished_at = datetime.now(UTC)
            await db.commit()
    except Exception as exc:
        async with get_session_factory()() as db:
            job = await db.get(ImportJob, job_id)
            if job is not None:
                job.status = ImportJobStatus.failed
                job.error_message = (
                    exc.message if isinstance(exc, AppError) else "Импорт не завершён"
                )
                job.finished_at = datetime.now(UTC)
                await db.commit()
        raise
    finally:
        if storage_key is not None:
            await get_object_storage().delete(storage_key)


async def process_account_export(_context: dict[str, Any], job_id_value: str) -> None:
    job_id = UUID(job_id_value)
    async with get_session_factory()() as db:
        job = await db.get(AccountExportJob, job_id)
        if job is None or job.status != AccountExportStatus.queued:
            return
        user = await db.get(User, job.user_id)
        if user is None:
            return
        job.status = AccountExportStatus.processing
        job.started_at = datetime.now(UTC)
        job.progress = 5
        await db.commit()

    try:
        async with get_session_factory()() as db:
            job = await db.get(AccountExportJob, job_id)
            if job is None:
                return
            user = await db.get(User, job.user_id)
            if user is None:
                raise RuntimeError("export user disappeared")
            service = AccountExportService(db)
            payload = await service.build_archive(user)
            job.progress = 80
            await db.commit()
            await service.store_archive(user, job, payload)
            job.status = AccountExportStatus.completed
            await db.commit()
            if user.email is not None:
                public = service.public(job)
                if public.download_url is not None:
                    await send_account_export_email(
                        user.email,
                        public.download_url,
                        get_settings().account_export_ttl_hours,
                    )
            job.progress = 100
            job.finished_at = datetime.now(UTC)
            await db.commit()
    except Exception:
        async with get_session_factory()() as db:
            job = await db.get(AccountExportJob, job_id)
            if job is not None:
                job.status = AccountExportStatus.failed
                job.error_message = "Экспорт не завершён"
                job.finished_at = datetime.now(UTC)
                await db.commit()
        raise


async def process_transcription(_context: dict[str, Any], job_id_value: str) -> None:
    job_id = UUID(job_id_value)
    storage = get_object_storage()
    part_keys: list[str] = []
    async with get_session_factory()() as db:
        job = await db.get(TranscriptionJob, job_id)
        if job is None or job.status != TranscriptionStatus.queued:
            return
        job.status = TranscriptionStatus.converting
        job.started_at = datetime.now(UTC)
        await db.commit()
        total_parts = job.total_parts
        source_suffix = Path(job.filename).suffix.lower()[:12] or ".bin"

    try:
        with tempfile.TemporaryDirectory(prefix="remora-transcription-") as temp_dir:
            source = Path(temp_dir) / f"source{source_suffix}"
            audio = Path(temp_dir) / "audio.flac"
            with source.open("wb") as target:
                for part in range(total_parts):
                    key = f"transcriptions/{job_id}/parts/{part:04d}"
                    part_keys.append(key)
                    payload, _ = await storage.read(key, 16 * 1024 * 1024)
                    target.write(payload)

            process = await asyncio.create_subprocess_exec(
                "ffmpeg",
                "-nostdin",
                "-y",
                "-i",
                str(source),
                "-vn",
                "-ac",
                "1",
                "-ar",
                "16000",
                "-c:a",
                "flac",
                str(audio),
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.PIPE,
            )
            _, stderr = await process.communicate()
            if process.returncode != 0 or not audio.exists():
                detail = stderr.decode("utf-8", errors="replace")[-1000:]
                raise RuntimeError(f"ffmpeg failed: {detail}")

            source.unlink()
            await storage.delete_many(part_keys)
            part_keys.clear()
            async with get_session_factory()() as db:
                job = await db.get(TranscriptionJob, job_id)
                if job is None:
                    return
                job.status = TranscriptionStatus.transcribing
                await db.commit()
                language = job.language
                beam_size = job.beam_size
                vad_filter = job.vad_filter
                word_timestamps = job.word_timestamps

            settings = get_settings()
            api_key = settings.faster_whisper_api_key
            if api_key is None:
                raise RuntimeError("faster-whisper is not configured")
            with audio.open("rb") as audio_file:
                async with httpx.AsyncClient(timeout=None, trust_env=False) as client:
                    fields = {
                        "beam_size": str(beam_size),
                        "vad_filter": str(vad_filter).lower(),
                        "word_timestamps": str(word_timestamps).lower(),
                    }
                    if language:
                        fields["language"] = language
                    response = await client.post(
                        f"{settings.faster_whisper_url.rstrip('/')}/transcribe",
                        headers={"X-API-Key": api_key.get_secret_value()},
                        files={"file": ("audio.flac", audio_file, "audio/flac")},
                        data=fields,
                    )
            response.raise_for_status()
            result = response.json()
            text = result.get("text")
            if not isinstance(text, str):
                raise RuntimeError("faster-whisper returned no text")

        async with get_session_factory()() as db:
            job = await db.get(TranscriptionJob, job_id)
            if job is not None:
                job.status = TranscriptionStatus.completed
                job.result_text = text.strip()
                job.finished_at = datetime.now(UTC)
                await db.commit()
    except Exception:
        async with get_session_factory()() as db:
            job = await db.get(TranscriptionJob, job_id)
            if job is not None:
                job.status = TranscriptionStatus.failed
                job.error_message = "Не удалось обработать файл. Проверьте его формат"
                job.finished_at = datetime.now(UTC)
                await db.commit()
        raise
    finally:
        await storage.delete_many(part_keys)


async def shutdown(_: dict[str, Any]) -> None:
    await dispose_engine()


async def sync_course_search(_context: dict[str, Any]) -> None:
    await synchronize_courses()


async def cleanup_transcriptions(_context: dict[str, Any]) -> None:
    now = datetime.now(UTC)
    async with get_session_factory()() as db:
        jobs = list(
            (
                await db.scalars(
                    select(TranscriptionJob).where(
                        or_(
                            TranscriptionJob.created_at < now - timedelta(hours=24),
                            (
                                (TranscriptionJob.status == TranscriptionStatus.uploading)
                                & (TranscriptionJob.created_at < now - timedelta(hours=6))
                            ),
                        )
                    )
                )
            ).all()
        )
        storage = get_object_storage()
        for job in jobs:
            await storage.delete_many(
                [f"transcriptions/{job.id}/parts/{part:04d}" for part in range(job.total_parts)]
            )
        if jobs:
            job_ids = [job.id for job in jobs]
            await db.execute(delete(TranscriptionJob).where(TranscriptionJob.id.in_(job_ids)))
            await db.commit()


class WorkerSettings:
    functions: ClassVar[list[object]] = [
        process_anki_import,
        process_account_export,
        process_transcription,
    ]
    cron_jobs: ClassVar[list[object]] = [
        cron("app.worker.sync_course_search", minute=None, second=0, run_at_startup=True),
        cron("app.worker.cleanup_transcriptions", minute=17, second=0),
    ]
    redis_settings = RedisSettings.from_dsn(str(get_settings().redis_url))
    on_shutdown = shutdown
    max_jobs = 4
    job_timeout = 10_800
    max_tries = 1
