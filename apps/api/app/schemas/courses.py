"""Контракт минимальной оболочки курса E6A."""

from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)


class CourseMetadata(BaseModel):
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]
    description: str = Field(default="", max_length=5000)


class CourseCreate(CourseMetadata):
    set_id: UUID | None = None


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
    likes_count: int = 0
    saves_count: int = 0
    liked_by_me: bool = False


class ArticleMediaRef(BaseModel):
    """Подписанная ссылка на изображение теории; body ссылается на неё через media:id."""

    id: UUID
    url: str
    width: int | None = None
    height: int | None = None


class CourseArticlePublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    set_id: UUID
    title: str
    body: str
    position: int
    media: list[ArticleMediaRef] = Field(default_factory=list)


class CourseSectionPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    position: int
    articles: list[CourseArticlePublic]


class CourseAuthor(BaseModel):
    id: UUID
    username: str
    display_name: str | None
    avatar_url: str | None


class CourseDetail(CourseSummary):
    author: CourseAuthor
    sections: list[CourseSectionPublic]


class CourseSitemapEntry(BaseModel):
    slug: str
    author_username: str
    updated_at: datetime


class ArticleWrite(BaseModel):
    id: UUID | None = None
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]
    body: str = Field(default="", max_length=100_000)
    # Без set_id для новой статьи создаётся пустой набор для обычного редактора карточек.
    set_id: UUID | None = None


class SectionWrite(BaseModel):
    id: UUID | None = None
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]
    articles: list[ArticleWrite] = Field(default_factory=list, max_length=100)


class CourseStructureWrite(BaseModel):
    revision: str
    sections: list[SectionWrite] = Field(max_length=50)

    @model_validator(mode="after")
    def limits(self) -> "CourseStructureWrite":
        articles = [a for s in self.sections for a in s.articles]
        if len(articles) > 100 or sum(len(a.body) for a in articles) > 1_000_000:
            raise ValueError("До 100 статей и 1 000 000 символов теории в курсе")
        return self


class CourseEditorDetail(CourseDetail):
    revision: str


class CourseCopyRequest(BaseModel):
    article_id: UUID | None = None
