"""Публичный контракт поиска без содержимого карточек и внутренних полей."""

from datetime import datetime
from typing import Literal, Self
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, Field, model_validator


class CourseSearchQuery(BaseModel):
    q: str = Field(default="", max_length=200)
    tag: str | None = Field(default=None, max_length=60)
    language: str | None = Field(default=None, max_length=10, pattern=r"^[a-zA-Z-]+$")
    author_id: UUID | None = None
    min_cards: int = Field(default=0, ge=0)
    max_cards: int | None = Field(default=None, ge=0)
    updated_after: AwareDatetime | None = None
    sort: Literal["relevance", "updated", "cards"] = "relevance"
    cursor: int = Field(default=0, ge=0, le=1000)
    limit: int = Field(default=20, ge=1, le=50)

    @model_validator(mode="after")
    def validate_range(self) -> Self:
        if self.max_cards is not None and self.max_cards < self.min_cards:
            raise ValueError("Максимум карточек меньше минимума")
        self.q = self.q.strip()
        if self.tag is not None:
            self.tag = self.tag.strip().lstrip("#").lower()
        if self.language is not None:
            self.language = self.language.lower()
        return self


class CourseSearchItem(BaseModel):
    id: UUID
    slug: str
    title: str
    description: str
    tags: list[str]
    author_id: UUID
    author: str
    languages: list[str]
    cards_count: int
    updated_at: datetime


class CourseSearchResult(BaseModel):
    items: list[CourseSearchItem]
    next_cursor: int | None
