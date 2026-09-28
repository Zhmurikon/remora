"""Контракт синхронизации прогресса практики Python."""

from datetime import datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class PracticeStatus(StrEnum):
    not_started = "not_started"
    in_progress = "in_progress"
    solved = "solved"


class PythonProgressUpdate(BaseModel):
    task_version: int = Field(ge=1, le=1_000_000)
    status: PracticeStatus
    attempts: int = Field(ge=0, le=1_000_000)
    draft: str = Field(max_length=50_000)
    client_updated_at: datetime
    client_mutation_id: UUID


class PythonProgressOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    task_id: str
    task_version: int
    status: PracticeStatus
    attempts: int
    draft: str
    draft_updated_at: datetime
    updated_at: datetime
    last_client_mutation_id: UUID
