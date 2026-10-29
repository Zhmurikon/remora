import secrets
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import current_user
from app.core.config import Settings, get_settings
from app.core.errors import ForbiddenError
from app.core.queue import enqueue_transcription
from app.db.session import get_db
from app.models.transcriptions import TranscriptionStatus
from app.models.user import User
from app.schemas.transcriptions import (
    TranscriptionCreate,
    TranscriptionPublic,
    TranscriptionUpdate,
    TranscriptionUploadPartsRequest,
    TranscriptionUploadPartUrl,
    TranscriptionUploadState,
    UserTranscriptionCreate,
)
from app.services.transcriptions import PART_BYTES, TranscriptionService

router = APIRouter()
internal_router = APIRouter(prefix="/internal/transcriptions", include_in_schema=False)
user_router = APIRouter(prefix="/transcriptions", tags=["transcriptions"])


def internal_access(
    token: Annotated[str | None, Header(alias="X-Transcriber-Token")] = None,
    settings: Settings = Depends(get_settings),
) -> None:
    if token is None or not secrets.compare_digest(token, settings.secret_key):
        raise ForbiddenError("Нет доступа к инструменту расшифровки")


@internal_router.post("", response_model=TranscriptionPublic, status_code=status.HTTP_201_CREATED)
async def create_job(
    body: TranscriptionCreate,
    _: None = Depends(internal_access),
    db: AsyncSession = Depends(get_db),
) -> TranscriptionPublic:
    job = await TranscriptionService(db).create(body)
    await db.commit()
    await db.refresh(job)
    return TranscriptionPublic.model_validate(job)


@internal_router.put("/{job_id}/parts/{part}", response_model=TranscriptionPublic)
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


@internal_router.post("/{job_id}/complete", response_model=TranscriptionPublic)
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


@internal_router.get("/{job_id}", response_model=TranscriptionPublic)
async def get_job(
    job_id: UUID,
    _: None = Depends(internal_access),
    db: AsyncSession = Depends(get_db),
) -> TranscriptionPublic:
    return TranscriptionPublic.model_validate(await TranscriptionService(db).get(job_id))


@user_router.get("", response_model=list[TranscriptionPublic], summary="Мои расшифровки")
async def list_transcriptions(
    user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> list[TranscriptionPublic]:
    jobs = await TranscriptionService(db).list_for_user(user)
    return [TranscriptionPublic.model_validate(job) for job in jobs]


@user_router.post(
    "",
    response_model=TranscriptionPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Создать расшифровку",
)
async def create_transcription(
    body: UserTranscriptionCreate,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> TranscriptionPublic:
    job = await TranscriptionService(db).create_for_user(user, body)
    await db.commit()
    await db.refresh(job)
    return TranscriptionPublic.model_validate(job)


@user_router.put("/{job_id}/parts/{part}", response_model=TranscriptionPublic)
async def upload_transcription_part(
    job_id: UUID,
    part: int,
    request: Request,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> TranscriptionPublic:
    service = TranscriptionService(db)
    await service.get_for_user(user, job_id)
    content_length = int(request.headers.get("content-length", "0"))
    if content_length > PART_BYTES:
        raise ForbiddenError("Часть файла слишком большая")
    job = await service.put_part(job_id, part, await request.body())
    await db.commit()
    await db.refresh(job)
    return TranscriptionPublic.model_validate(job)


@user_router.get(
    "/{job_id}/upload", response_model=TranscriptionUploadState, summary="Состояние прямой загрузки"
)
async def get_transcription_upload(
    job_id: UUID,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> TranscriptionUploadState:
    state = await TranscriptionService(db).upload_state(user, job_id)
    await db.commit()
    return state


@user_router.post(
    "/{job_id}/upload/parts",
    response_model=list[TranscriptionUploadPartUrl],
    summary="Подписать части прямой загрузки",
)
async def sign_transcription_upload_parts(
    job_id: UUID,
    body: TranscriptionUploadPartsRequest,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> list[TranscriptionUploadPartUrl]:
    return await TranscriptionService(db).sign_upload_parts(user, job_id, body.part_numbers)


@user_router.post("/{job_id}/complete", response_model=TranscriptionPublic)
async def complete_transcription(
    job_id: UUID,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> TranscriptionPublic:
    service = TranscriptionService(db)
    current = await service.get_for_user(user, job_id)
    should_enqueue = current.status == TranscriptionStatus.uploading
    job = (
        await service.complete_user_upload(user, job_id)
        if current.storage_upload_id
        else await service.complete(job_id)
    )
    await db.commit()
    if not should_enqueue:
        await db.refresh(job)
        return TranscriptionPublic.model_validate(job)
    try:
        await enqueue_transcription(str(job.id))
    except Exception as exc:
        job.status = TranscriptionStatus.failed
        job.error_message = "Не удалось поставить расшифровку в очередь"
        await service.release_quota(user, job)
        await db.commit()
        raise ForbiddenError("Очередь расшифровки временно недоступна") from exc
    await db.refresh(job)
    return TranscriptionPublic.model_validate(job)


@user_router.get("/{job_id}", response_model=TranscriptionPublic, summary="Расшифровка")
async def get_transcription(
    job_id: UUID,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> TranscriptionPublic:
    job = await TranscriptionService(db).get_for_user(user, job_id)
    return TranscriptionPublic.model_validate(job)


@user_router.patch("/{job_id}", response_model=TranscriptionPublic, summary="Изменить расшифровку")
async def update_transcription(
    job_id: UUID,
    body: TranscriptionUpdate,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> TranscriptionPublic:
    job = await TranscriptionService(db).update_for_user(user, job_id, body)
    await db.commit()
    await db.refresh(job)
    return TranscriptionPublic.model_validate(job)


@user_router.delete(
    "/{job_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Удалить расшифровку"
)
async def delete_transcription(
    job_id: UUID,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    await TranscriptionService(db).delete_for_user(user, job_id)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


router.include_router(internal_router)
router.include_router(user_router)
