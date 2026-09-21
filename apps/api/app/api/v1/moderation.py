"""Служебная очередь постмодерации.

Минимальный рабочий процесс E6A: посмотреть жалобы и принять по ним решение.
Полноценная панель модератора с журналом действий и аудитом — задача E10.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import moderator_user
from app.db.session import get_db
from app.models.moderation import ReportStatus
from app.models.user import User
from app.schemas.moderation import ReportItem, ReportResolution
from app.services.moderation import ModerationService

router = APIRouter(prefix="/moderation", tags=["moderation"])


@router.get("/reports", response_model=list[ReportItem], summary="Очередь жалоб")
async def list_reports(
    status: ReportStatus | None = Query(default=ReportStatus.open),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    _: User = Depends(moderator_user),
    db: AsyncSession = Depends(get_db),
) -> list[ReportItem]:
    return await ModerationService(db).queue(status, offset=offset, limit=limit)


@router.post(
    "/reports/{report_id}/resolve", response_model=ReportItem, summary="Решение по жалобе"
)
async def resolve_report(
    report_id: UUID,
    body: ReportResolution,
    moderator: User = Depends(moderator_user),
    db: AsyncSession = Depends(get_db),
) -> ReportItem:
    return await ModerationService(db).resolve(moderator, report_id, body)
