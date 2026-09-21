"""Контракт жалоб и решений постмодерации."""

from datetime import datetime
from typing import Annotated, Literal
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
