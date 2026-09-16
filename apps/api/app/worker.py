"""ARQ worker для долговечных фоновых операций."""

from datetime import UTC, datetime
from typing import Any, ClassVar
from uuid import UUID

from arq import cron
from arq.connections import RedisSettings
from sqlalchemy import update

from app.core.config import get_settings
from app.core.email import send_account_export_email
from app.core.errors import AppError
from app.core.storage import get_object_storage
from app.db.session import dispose_engine, get_session_factory
from app.models.exports import AccountExportJob, AccountExportStatus
from app.models.imports import ImportJob, ImportJobStatus
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


async def shutdown(_: dict[str, Any]) -> None:
    await dispose_engine()


async def sync_course_search(_context: dict[str, Any]) -> None:
    await synchronize_courses()


class WorkerSettings:
    functions: ClassVar[list[object]] = [process_anki_import, process_account_export]
    cron_jobs: ClassVar[list[object]] = [
        cron("app.worker.sync_course_search", minute=None, second=0, run_at_startup=True)
    ]
    redis_settings = RedisSettings.from_dsn(str(get_settings().redis_url))
    on_shutdown = shutdown
    max_jobs = 4
    job_timeout = 900
    max_tries = 1
