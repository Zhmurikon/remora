"""Контракты состояния системы, фиче-флагов и инцидентов."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, HttpUrl

SystemState = Literal["ok", "degraded", "disabled", "unknown"]
Environment = Literal["local", "staging", "production"]
IncidentSeverity = Literal["low", "medium", "high", "critical"]
IncidentStatus = Literal["open", "monitoring", "resolved"]


class AdminSystemCheck(BaseModel):
    key: str
    label: str
    group: str
    state: SystemState
    detail: str
    checked_at: datetime


class AdminMonitoringLink(BaseModel):
    label: str
    url: str


class AdminFeatureFlagItem(BaseModel):
    id: UUID
    key: str
    description: str
    enabled: bool
    effective: bool
    environment: str
    owner: str
    expires_at: datetime | None
    updated_at: datetime
    updated_by: str | None


class AdminIncidentItem(BaseModel):
    id: UUID
    title: str
    summary: str
    severity: str
    status: str
    external_url: str | None
    started_at: datetime
    resolved_at: datetime | None
    created_at: datetime
    updated_at: datetime
    updated_by: str | None


class AdminSystemOverview(BaseModel):
    checks: list[AdminSystemCheck]
    flags: list[AdminFeatureFlagItem]
    incidents: list[AdminIncidentItem]
    monitoring_links: list[AdminMonitoringLink]
    checked_at: datetime


class AdminFeatureFlagWrite(BaseModel):
    key: str = Field(min_length=3, max_length=120, pattern=r"^[a-z0-9][a-z0-9._-]+$")
    description: str = Field(min_length=3, max_length=500)
    enabled: bool
    environment: Environment
    owner: str = Field(min_length=2, max_length=160)
    expires_at: datetime | None = None
    reason: str = Field(min_length=10, max_length=500)


class AdminIncidentCreate(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    summary: str = Field(min_length=10, max_length=4000)
    severity: IncidentSeverity
    external_url: HttpUrl | None = None
    started_at: datetime
    reason: str = Field(min_length=10, max_length=500)


class AdminIncidentUpdate(BaseModel):
    summary: str = Field(min_length=10, max_length=4000)
    severity: IncidentSeverity
    status: IncidentStatus
    external_url: HttpUrl | None = None
    reason: str = Field(min_length=10, max_length=500)
