"""Контракт жалоб и решений постмодерации."""

from datetime import datetime
from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, StringConstraints

from app.models.moderation import ReportReason, ReportStatus


class ReportCreate(BaseModel):
    reason: ReportReason
    comment: Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)] = ""


class ReportSubmitted(BaseModel):
    """Автору жалобы возвращаем только факт приёма, без внутренней кухни модерации."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    reason: ReportReason
    status: ReportStatus
    created_at: datetime


class ReportResolution(BaseModel):
    """`accepted` блокирует курс, `rejected` снимает подозрения и оставляет его доступным."""

    # Literal вместо ReportStatus: «open» не является решением и не должен проходить валидацию.
    outcome: Literal[ReportStatus.accepted, ReportStatus.rejected]


class ReportItem(BaseModel):
    """Строка очереди модератора."""

    id: UUID
    reason: ReportReason
    comment: str
    status: ReportStatus
    created_at: datetime
    resolved_at: datetime | None
    course_id: UUID
    course_slug: str
    course_title: str
    course_moderation_status: str
    course_is_published: bool
    reporter_username: str


class ModerationCourseItem(BaseModel):
    id: UUID
    slug: str
    title: str
    description: str
    is_published: bool
    moderation_status: str
    owner_id: UUID
    owner_username: str
    owner_status: str
    open_reports: int
    priority: int
    automatic_signals: list[str]
    created_at: datetime


class ModerationActionRequest(BaseModel):
    action: Literal["warn", "unpublish", "block", "restore", "ban_author"]
    reason: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=2000)]


class ModerationActionItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    actor_id: UUID | None
    action: str
    target_type: str
    target_id: UUID
    reason: str
    details: dict[str, Any]
    created_at: datetime


class AuditLogItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    actor_id: UUID | None
    event: str
    target_type: str
    target_id: UUID | None
    details: dict[str, Any]
    ip: str | None
    request_id: str | None
    created_at: datetime
