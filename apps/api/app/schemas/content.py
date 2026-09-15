"""Схемы наборов и карточек."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.content import ContentType, SetVisibility


class CardWrite(BaseModel):
    id: UUID | None = None
    term: str = Field(max_length=10_000)
    definition: str = Field(max_length=10_000)
    term_transcription: str | None = Field(default=None, max_length=300)
    definition_transcription: str | None = Field(default=None, max_length=300)
    hint: str | None = Field(default=None, max_length=1000)
    content_type: ContentType = ContentType.text
    code_language: str | None = Field(default=None, max_length=50)
    alt_answers: list[str] = Field(default_factory=list, max_length=30)


class CardPublic(CardWrite):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    position: int
    created_at: datetime
    updated_at: datetime


class SetCreate(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    description: str = Field(default="", max_length=5000)
    visibility: SetVisibility = SetVisibility.private
    lang_term: str = Field(default="ru", min_length=2, max_length=10)
    lang_definition: str = Field(default="ru", min_length=2, max_length=10)


class SetUpdate(SetCreate):
    pass


class SetSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    title: str
    description: str
    visibility: SetVisibility
    slug: str
    cards_count: int
    created_at: datetime
    updated_at: datetime


class SetDetail(SetSummary):
    lang_term: str
    lang_definition: str
    cards: list[CardPublic]


class CardBatch(BaseModel):
    cards: list[CardWrite] = Field(max_length=300)
