from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class AssistantOptions(BaseModel):
    destination: Literal["later", "new", "existing"] = "later"
    course_id: UUID | None = None
    course_title: str = Field(default="", max_length=160)
    detail: Literal["short", "balanced", "detailed"] = "balanced"
    formulas: bool = True
    diagrams: bool = False
    card_count: int = Field(default=12, ge=3, le=12)


class AssistantCreate(BaseModel):
    request_id: UUID
    source_ids: list[UUID] = Field(min_length=1, max_length=5)
    result: Literal["notes", "both", "cards", "transcript"] = "notes"
    options: AssistantOptions = Field(default_factory=AssistantOptions)


class AssistantPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    source_id: UUID
    source_ids: list[UUID]
    result: str
    status: str
    error_message: str | None
    note_id: UUID | None
    cards_id: UUID | None
    options: AssistantOptions


class NoteCourseRequest(BaseModel):
    revision: datetime
    course_id: UUID | None = None
    title: str = Field(default="", max_length=160)


class NoteRefineRequest(BaseModel):
    request_id: UUID
    revision: datetime
    instruction: str = Field(min_length=1, max_length=2000)
    scope: Literal["all", "fragment"] = "all"
    fragment: str | None = Field(default=None, max_length=100_000)


class NoteApplyRequest(BaseModel):
    revision: datetime
    proposal_id: UUID


class NoteRevisionPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    markdown: str
    created_at: datetime
