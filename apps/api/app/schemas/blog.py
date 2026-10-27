from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, StringConstraints, model_validator

Slug = Annotated[str, StringConstraints(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")]
Anchor = Annotated[str, StringConstraints(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")]
Tone = Literal["mint", "lavender", "peach"]
Paragraph = Annotated[str, StringConstraints(min_length=1, max_length=5000)]
Step = Annotated[str, StringConstraints(min_length=1, max_length=2000)]
DiagramLabel = Annotated[str, StringConstraints(min_length=1, max_length=80)]


class BlogSource(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    title: str = Field(min_length=1, max_length=240)
    url: HttpUrl


class BlogExample(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    question: str = Field(min_length=1, max_length=2000)
    answer: str = Field(min_length=1, max_length=4000)


class BlogSectionWrite(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    id: Anchor
    title: str = Field(min_length=1, max_length=180)
    paragraphs: list[Paragraph] = Field(default_factory=list, max_length=100)
    rich_text: str = Field(default="", max_length=100_000)
    steps: list[Step] = Field(default_factory=list, max_length=100)
    example: BlogExample | None = None


class BlogPostWrite(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    slug: Slug
    title: str = Field(min_length=1, max_length=180)
    description: str = Field(min_length=1, max_length=500)
    category: str = Field(min_length=1, max_length=80)
    tone: Tone = "mint"
    diagram: tuple[DiagramLabel, DiagramLabel, DiagramLabel]
    cover_media_id: UUID | None = None
    cover_alt: str | None = Field(default=None, max_length=300)
    sections: list[BlogSectionWrite] = Field(min_length=1, max_length=50)
    sources: list[BlogSource] = Field(default_factory=list, max_length=50)
    related: list[Slug] = Field(default_factory=list, max_length=20)

    @model_validator(mode="after")
    def validate_document(self) -> "BlogPostWrite":
        ids = [section.id for section in self.sections]
        if len(ids) != len(set(ids)):
            raise ValueError("Якоря разделов должны быть уникальны")
        if self.cover_media_id and not self.cover_alt:
            raise ValueError("Для обложки нужен осмысленный cover_alt")
        if (
            sum(
                len(section.rich_text)
                + sum(map(len, section.paragraphs))
                + sum(map(len, section.steps))
                for section in self.sections
            )
            > 300_000
        ):
            raise ValueError("Текст статьи превышает 300 000 символов")
        return self


class BlogPostUpdate(BlogPostWrite):
    revision: int = Field(ge=1)


class BlogPublication(BaseModel):
    model_config = ConfigDict(extra="forbid")
    revision: int = Field(ge=1)


class BlogMediaPublic(BaseModel):
    url: str
    width: int | None = None
    height: int | None = None


class BlogCoverPublic(BaseModel):
    src: str
    alt: str


class BlogSectionPublic(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: str
    title: str
    paragraphs: list[str] = Field(default_factory=list)
    rich_text: str = Field(default="", serialization_alias="richText")
    media: dict[str, BlogMediaPublic] = Field(default_factory=dict)
    steps: list[str] = Field(default_factory=list)
    example: BlogExample | None = None


class BlogPostDetail(BlogPostWrite):
    id: UUID
    status: Literal["draft", "scheduled", "published"]
    revision: int
    published_at: datetime | None
    updated_at: datetime


class BlogPostPublic(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    slug: str
    status: Literal["published"] = "published"
    title: str
    description: str
    category: str
    published_at: datetime = Field(serialization_alias="publishedAt")
    updated_at: datetime = Field(serialization_alias="updatedAt")
    tone: Tone
    diagram: tuple[str, str, str]
    cover: BlogCoverPublic | None = None
    sections: list[BlogSectionPublic]
    sources: list[BlogSource] = Field(default_factory=list)
    related: list[str] = Field(default_factory=list)


class BlogPostSummary(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    slug: str
    status: Literal["published"] = "published"
    title: str
    description: str
    category: str
    published_at: datetime = Field(serialization_alias="publishedAt")
    updated_at: datetime = Field(serialization_alias="updatedAt")
    tone: Tone
    diagram: tuple[str, str, str]
    cover: BlogCoverPublic | None = None
    reading_minutes: int = Field(serialization_alias="readingMinutes", ge=1)
    related: list[str] = Field(default_factory=list)


class BlogSitemapEntry(BaseModel):
    slug: str
    updated_at: datetime
