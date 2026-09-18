"""Контракты связанной библиотеки публичных материалов."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel


class LibrarySaveCreate(BaseModel):
    target_type: Literal["course", "article", "set"]
    target_id: UUID


class LibraryItem(BaseModel):
    id: UUID
    target_type: Literal["course", "article", "set"]
    target_id: UUID
    course_id: UUID
    course_slug: str
    course_title: str
    article_id: UUID | None = None
    article_title: str | None = None
    set_id: UUID | None = None
    set_title: str | None = None
    cards_count: int
    saved_at: datetime
    accepted_at: datetime
    has_updates: bool


class LibraryDiff(BaseModel):
    save_id: UUID
    has_updates: bool
    accepted_at: datetime
    summary: list[str]
    articles_added: int = 0
    articles_removed: int = 0
    articles_changed: int = 0
    cards_added: int = 0
    cards_removed: int = 0
    cards_changed: int = 0


class LibraryState(BaseModel):
    course_saved: bool
    saved_article_ids: list[UUID]
    saved_set_ids: list[UUID]
