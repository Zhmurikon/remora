"""Служебная очередь постмодерации.

Минимальный рабочий процесс E6A: посмотреть жалобы и принять по ним решение.
Полноценная панель модератора с журналом действий и аудитом — задача E10.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import admin_user, moderator_user
from app.db.session import get_db
from app.models.moderation import ReportStatus
from app.models.user import User
from app.schemas.moderation import (
    AuditLogItem,
    ModerationActionItem,
    ModerationActionRequest,
    ModerationCourseItem,
    ReportItem,
    ReportResolution,
)
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


@router.post("/reports/{report_id}/resolve", response_model=ReportItem, summary="Решение по жалобе")
async def resolve_report(
    request: Request,
    report_id: UUID,
    body: ReportResolution,
    moderator: User = Depends(moderator_user),
    db: AsyncSession = Depends(get_db),
) -> ReportItem:
    return await ModerationService(db).resolve(
        moderator,
        report_id,
        body,
        ip=request.client.host if request.client else None,
        request_id=getattr(request.state, "request_id", None),
    )


@router.get("/courses", response_model=list[ModerationCourseItem], summary="Очередь публикаций")
async def list_courses(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    _: User = Depends(moderator_user),
    db: AsyncSession = Depends(get_db),
) -> list[ModerationCourseItem]:
    return await ModerationService(db).courses(offset=offset, limit=limit)


@router.post(
    "/courses/{course_id}/actions",
    response_model=ModerationActionItem,
    summary="Применить действие модератора",
)
async def act_on_course(
    request: Request,
    course_id: UUID,
    body: ModerationActionRequest,
    moderator: User = Depends(moderator_user),
    db: AsyncSession = Depends(get_db),
) -> ModerationActionItem:
    return await ModerationService(db).act(
        moderator,
        course_id,
        body,
        ip=request.client.host if request.client else None,
        request_id=getattr(request.state, "request_id", None),
    )


@router.get("/actions", response_model=list[ModerationActionItem], summary="Журнал модерации")
async def list_actions(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=200),
    _: User = Depends(moderator_user),
    db: AsyncSession = Depends(get_db),
) -> list[ModerationActionItem]:
    return await ModerationService(db).actions(offset=offset, limit=limit)


@router.get("/audit", response_model=list[AuditLogItem], summary="Служебный аудит")
async def list_audit(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=200),
    _: User = Depends(admin_user),
    db: AsyncSession = Depends(get_db),
) -> list[AuditLogItem]:
    return await ModerationService(db).audit(offset=offset, limit=limit)
