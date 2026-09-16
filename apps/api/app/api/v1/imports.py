"""Импорт карточек из внешних сервисов."""

from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import current_user
from app.core.errors import ConflictError
from app.core.queue import enqueue_import
from app.db.session import get_db
from app.models.imports import ImportJobStatus
from app.models.user import User
from app.schemas.imports import AnkiImportResult, ImportJobPublic
from app.services.imports import ImportService

router = APIRouter(prefix="/imports", tags=["imports"])
MAX_FILE_BYTES = 100 * 1024 * 1024


async def _read_upload(request: Request) -> bytes:
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > MAX_FILE_BYTES:
                raise ConflictError("Файл Anki слишком большой")
        except ValueError as exc:
            raise ConflictError("Некорректный размер файла") from exc
    payload = await request.body()
    if not payload:
        raise ConflictError("Файл пуст")
    if len(payload) > MAX_FILE_BYTES:
        raise ConflictError("Файл Anki слишком большой")
    return payload


@router.post("/sets/{set_id}/anki", response_model=AnkiImportResult, summary="Импортировать Anki")
async def import_anki(
    set_id: UUID,
    request: Request,
    filename: str = Query(min_length=1, max_length=255),
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> AnkiImportResult:
    payload = await _read_upload(request)
    return await ImportService(db).import_anki(user, set_id, filename, payload)


@router.post(
    "/sets/{set_id}/anki/jobs",
    response_model=ImportJobPublic,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Поставить импорт Anki в очередь",
)
async def create_anki_job(
    set_id: UUID,
    request: Request,
    filename: str = Query(min_length=1, max_length=255),
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> ImportJobPublic:
    job = await ImportService(db).create_job(user, set_id, filename, await _read_upload(request))
    await db.commit()
    try:
        await enqueue_import(str(job.id))
    except Exception as exc:
        job.status = ImportJobStatus.failed
        job.error_message = "Не удалось поставить импорт в очередь"
        await db.commit()
        raise ConflictError("Очередь импорта временно недоступна") from exc
    await db.refresh(job)
    return ImportJobPublic.model_validate(job)


@router.get("/jobs/{job_id}", response_model=ImportJobPublic, summary="Статус импорта")
async def get_import_job(
    job_id: UUID,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> ImportJobPublic:
    return ImportJobPublic.model_validate(await ImportService(db).get_job(user, job_id))


@router.get(
    "/sets/{set_id}/jobs",
    response_model=list[ImportJobPublic],
    summary="Последние импорты набора",
)
async def list_import_jobs(
    set_id: UUID,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ImportJobPublic]:
    jobs = await ImportService(db).list_jobs(user, set_id)
    return [ImportJobPublic.model_validate(job) for job in jobs]
