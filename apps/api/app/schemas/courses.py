"""Контракт минимальной оболочки курса E6A."""

from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator


class CourseMetadata(BaseModel):
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]
    description: str = Field(default="", max_length=5000)


class CourseCreate(CourseMetadata):
    set_id: UUID


class CoursePublication(BaseModel):
    tags: list[str] = Field(default_factory=list, max_length=20)

    @field_validator("tags")
    @classmethod
    def normalize_tags(cls, values: list[str]) -> list[str]:
        result: list[str] = []
        for value in values:
            tag = " ".join(value.strip().lstrip("#").lower().split())
            if not tag or len(tag) > 60 or any(not (c.isalnum() or c in " -_") for c in tag):
                raise ValueError("Тег должен содержать 1–60 букв, цифр, пробелов или дефисов")
            if tag not in result:
                result.append(tag)
        return result


class CourseSummary(CourseMetadata):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    slug: str
    created_at: datetime
    updated_at: datetime
    is_published: bool
    is_listed: bool
    published_at: datetime | None
    moderation_status: str
    tags: list[str]


class CourseArticlePublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    set_id: UUID
    title: str
    body: str
    position: int


class CourseSectionPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    position: int
    articles: list[CourseArticlePublic]


class CourseDetail(CourseSummary):
    sections: list[CourseSectionPublic]
