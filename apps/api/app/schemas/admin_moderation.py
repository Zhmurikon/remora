"""Контракты административной очереди постмодерации."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.moderation import ReportReason, ReportStatus


class AdminModerationReportItem(BaseModel):
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
    author_id: UUID
    author_username: str
    reporter_username: str


class AdminModerationReportList(BaseModel):
    items: list[AdminModerationReportItem]
    total: int
    offset: int
    limit: int


class AdminModerationCourseItem(BaseModel):
    id: UUID
    slug: str
    title: str
    description: str
    author_id: UUID
    author_username: str
    is_published: bool
    is_listed: bool
    moderation_status: str
    published_at: datetime | None
    updated_at: datetime
    reports_total: int
    reports_open: int
    last_report_at: datetime | None
    risk_signals: list[str]


class AdminModerationHistoryItem(BaseModel):
    id: UUID
    action: str
    actor_username: str | None
    reason: str | None
    details: dict[str, object]
    created_at: datetime


class AdminModerationCourseDetail(AdminModerationCourseItem):
    reports: list[AdminModerationReportItem]
    history: list[AdminModerationHistoryItem]


class AdminModerationCourseList(BaseModel):
    items: list[AdminModerationCourseItem]
    total: int
    offset: int
    limit: int


class AdminModerationResolution(BaseModel):
    outcome: Literal[ReportStatus.accepted, ReportStatus.rejected]
    reason: str = Field(min_length=10, max_length=500)


class AdminModerationCourseAction(BaseModel):
    action: Literal["warn", "unpublish", "block", "restore"]
    reason: str = Field(min_length=10, max_length=500)
