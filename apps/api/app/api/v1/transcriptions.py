import secrets
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.errors import ForbiddenError
from app.core.queue import enqueue_transcription
from app.db.session import get_db
from app.models.transcriptions import TranscriptionStatus
from app.schemas.transcriptions import TranscriptionCreate, TranscriptionPublic
from app.services.transcriptions import PART_BYTES, TranscriptionService

router = APIRouter(prefix="/internal/transcriptions", include_in_schema=False)


def internal_access(
    token: Annotated[str | None, Header(alias="X-Transcriber-Token")] = None,
    settings: Settings = Depends(get_settings),
) -> None:
    if token is None or not secrets.compare_digest(token, settings.secret_key):
        raise ForbiddenError("Нет доступа к инструменту расшифровки")


@router.post("", response_model=TranscriptionPublic, status_code=status.HTTP_201_CREATED)
async def create_job(
    body: TranscriptionCreate,
    _: None = Depends(internal_access),
    db: AsyncSession = Depends(get_db),
) -> TranscriptionPublic:
    job = await TranscriptionService(db).create(body)
    await db.commit()
    await db.refresh(job)
    return TranscriptionPublic.model_validate(job)


@router.put("/{job_id}/parts/{part}", response_model=TranscriptionPublic)
async def upload_part(
    job_id: UUID,
    part: int,
    request: Request,
    _: None = Depends(internal_access),
    db: AsyncSession = Depends(get_db),
) -> TranscriptionPublic:
    content_length = int(request.headers.get("content-length", "0"))
    if content_length > PART_BYTES:
        raise ForbiddenError("Часть файла слишком большая")
    job = await TranscriptionService(db).put_part(job_id, part, await request.body())
    await db.commit()
    await db.refresh(job)
    return TranscriptionPublic.model_validate(job)


@router.post("/{job_id}/complete", response_model=TranscriptionPublic)
async def complete_job(
    job_id: UUID,
    _: None = Depends(internal_access),
    db: AsyncSession = Depends(get_db),
) -> TranscriptionPublic:
    job = await TranscriptionService(db).complete(job_id)
    await db.commit()
    try:
        await enqueue_transcription(str(job.id))
    except Exception as exc:
        job.status = TranscriptionStatus.failed
        job.error_message = "Не удалось поставить расшифровку в очередь"
        await db.commit()
        raise ForbiddenError("Очередь расшифровки временно недоступна") from exc
    await db.refresh(job)
    return TranscriptionPublic.model_validate(job)


@router.get("/{job_id}", response_model=TranscriptionPublic)
async def get_job(
    job_id: UUID,
    _: None = Depends(internal_access),
    db: AsyncSession = Depends(get_db),
) -> TranscriptionPublic:
    return TranscriptionPublic.model_validate(await TranscriptionService(db).get(job_id))

