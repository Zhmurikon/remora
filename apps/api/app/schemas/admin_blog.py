"""Контракты редакционного блога в административной панели."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from app.schemas.blog import BlogPostDetail


class AdminBlogPostItem(BaseModel):
    id: UUID
    slug: str
    title: str
    description: str
    category: str
    state: Literal["draft", "scheduled", "published"]
    revision: int
    author_id: UUID
    author_username: str
    published_at: datetime | None
    updated_at: datetime


class AdminBlogPostList(BaseModel):
    items: list[AdminBlogPostItem]
    total: int
    offset: int
    limit: int


class AdminBlogHistoryItem(BaseModel):
    id: UUID
    action: str
    actor_username: str | None
    reason: str | None
    details: dict[str, object]
    created_at: datetime


class AdminBlogPostDetail(BlogPostDetail):
    state: Literal["draft", "scheduled", "published"]
    author_id: UUID
    author_username: str
    history: list[AdminBlogHistoryItem]


class AdminBlogPublicationAction(BaseModel):
    action: Literal["publish", "schedule", "unpublish"]
    revision: int = Field(ge=1)
    reason: str = Field(min_length=10, max_length=500)
    publish_at: datetime | None = None

    @model_validator(mode="after")
    def validate_schedule(self) -> "AdminBlogPublicationAction":
        if self.action == "schedule" and self.publish_at is None:
            raise ValueError("Для отложенной публикации нужна дата")
        if self.action != "schedule" and self.publish_at is not None:
            raise ValueError("Дата допустима только для отложенной публикации")
        return self
