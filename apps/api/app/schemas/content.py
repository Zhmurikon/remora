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
    term_image_id: UUID | None = None
    definition_image_id: UUID | None = None
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
    folder_id: UUID | None = None


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
    folder_id: UUID | None
    created_at: datetime
    updated_at: datetime


class SetDetail(SetSummary):
    lang_term: str
    lang_definition: str
    cards: list[CardPublic]


class PublicCard(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    position: int
    term: str
    definition: str
    term_transcription: str | None
    definition_transcription: str | None
    hint: str | None
    content_type: ContentType
    code_language: str | None
    term_image_url: str | None = None
    definition_image_url: str | None = None


class PublicSetAuthor(BaseModel):
    username: str
    display_name: str | None
    avatar_url: str | None


class PublicSet(BaseModel):
    course_url: str | None = None
    next_cursor: int | None = None
    id: UUID
    title: str
    description: str
    visibility: SetVisibility
    slug: str
    cards_count: int
    lang_term: str
    lang_definition: str
    author: PublicSetAuthor
    cards: list[PublicCard]
    created_at: datetime
    updated_at: datetime


class CardBatch(BaseModel):
    # Технический потолок синхронизации; тарифные квоты позже проверяет только Entitlements.
    cards: list[CardWrite] = Field(max_length=5000)


class FolderCreate(BaseModel):
    title: str = Field(min_length=1, max_length=100)
    color: str = Field(default="lime", pattern=r"^(lime|blue|violet|orange|rose)$")
    parent_id: UUID | None = None


class FolderUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=100)
    color: str | None = Field(default=None, pattern=r"^(lime|blue|violet|orange|rose)$")
    parent_id: UUID | None = None
    position: int | None = Field(default=None, ge=0)


class FolderPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    parent_id: UUID | None
    title: str
    color: str
    position: int
    created_at: datetime
    updated_at: datetime
