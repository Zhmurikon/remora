import logging
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import current_user
from app.core.queue import enqueue_generation
from app.db.session import get_db
from app.models.user import User
from app.schemas.generations import (
    GenerationCreate,
    GenerationPublic,
    GenerationSaveSet,
    GenerationUpdate,
)
from app.services.generations import GenerationService

router = APIRouter(tags=["generations"])
logger = logging.getLogger(__name__)


@router.get("/transcriptions/{source_id}/generations", response_model=list[GenerationPublic])
async def list_generations(
    source_id: UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> list[GenerationPublic]:
    service = GenerationService(db)
    return [service.public(job) for job in await service.list(user, source_id)]


@router.post(
    "/transcriptions/{source_id}/generations", response_model=GenerationPublic, status_code=202
)
async def create_generation(
    source_id: UUID,
    body: GenerationCreate,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> GenerationPublic:
    service = GenerationService(db)
    job = await service.create(user, source_id, body)
    await db.commit()
    await db.refresh(job)
    if job.status == "queued":
        try:
            await enqueue_generation(str(job.id))
        except Exception:  # noqa: BLE001 — очередь восстановит cron без повторной оплаты
            # Долговечное задание подхватит периодическое восстановление очереди.
            logger.warning("generation_enqueue_deferred job=%s", job.id)
    return service.public(job)


@router.get("/generations/{job_id}", response_model=GenerationPublic)
async def get_generation(
    job_id: UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> GenerationPublic:
    service = GenerationService(db)
    return service.public(await service.get(user, job_id))


@router.patch("/generations/{job_id}", response_model=GenerationPublic)
async def update_generation(
    job_id: UUID,
    body: GenerationUpdate,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> GenerationPublic:
    service = GenerationService(db)
    job = await service.update(user, job_id, body)
    await db.commit()
    await db.refresh(job)
    return service.public(job)


@router.post("/generations/{job_id}/save-set", response_model=GenerationPublic)
async def save_generation_set(
    job_id: UUID,
    body: GenerationSaveSet,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> GenerationPublic:
    service = GenerationService(db)
    job = await service.save_set(user, job_id, body)
    await db.commit()
    await db.refresh(job)
    return service.public(job)
