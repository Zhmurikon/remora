"""Операции над собственным аккаунтом, не относящиеся к аутентификации."""

from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import current_user
from app.core.queue import enqueue_account_export
from app.db.session import get_db
from app.models.exports import AccountExportStatus
from app.models.user import User
from app.schemas.exports import AccountExportPublic
from app.services.account_exports import AccountExportService

router = APIRouter(prefix="/users/me", tags=["users"])


@router.post(
    "/export",
    response_model=AccountExportPublic,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Запросить полный экспорт аккаунта",
)
async def create_account_export(
    user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> AccountExportPublic:
    service = AccountExportService(db)
    job = await service.create_job(user)
    await db.commit()
    try:
        await enqueue_account_export(str(job.id))
    except Exception:
        job.status = AccountExportStatus.failed
        job.error_message = "Не удалось поставить экспорт в очередь"
        await db.commit()
        raise
    return service.public(job)


@router.get(
    "/export/latest",
    response_model=AccountExportPublic | None,
    summary="Последний экспорт аккаунта",
)
async def latest_account_export(
    user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> AccountExportPublic | None:
    service = AccountExportService(db)
    job = await service.latest_job(user)
    return service.public(job) if job is not None else None


@router.get(
    "/export/{job_id}", response_model=AccountExportPublic, summary="Статус экспорта аккаунта"
)
async def get_account_export(
    job_id: UUID,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> AccountExportPublic:
    service = AccountExportService(db)
    return service.public(await service.get_job(user, job_id))
