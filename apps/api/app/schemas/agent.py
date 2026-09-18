from typing import Literal, Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.content import CardWrite, SetDetail
from app.schemas.courses import CourseMetadata, CourseSummary


class AgentSetWrite(CourseMetadata):
    model_config = ConfigDict(extra="forbid")
    lang_term: str = Field(default="ru", min_length=2, max_length=10)
    lang_definition: str = Field(default="ru", min_length=2, max_length=10)
    cards: list[CardWrite] = Field(default_factory=list, max_length=5000)


class AgentSetUpdate(AgentSetWrite):
    revision: str = Field(min_length=64, max_length=64)


class AgentSetDetail(SetDetail):
    revision: str


class AgentArticleWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: UUID | None = None
    title: str = Field(min_length=1, max_length=160)
    body: str = Field(default="", max_length=100_000)
    material: AgentSetWrite


class AgentSectionWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: UUID | None = None
    title: str = Field(min_length=1, max_length=160)
    articles: list[AgentArticleWrite] = Field(default_factory=list, max_length=100)


class AgentCourseWrite(CourseMetadata):
    model_config = ConfigDict(extra="forbid")
    sections: list[AgentSectionWrite] = Field(default_factory=list, max_length=50)

    @model_validator(mode="after")
    def check_size(self) -> Self:
        articles = [a for s in self.sections for a in s.articles]
        if len(articles) > 100 or sum(len(a.material.cards) for a in articles) > 5000:
            raise ValueError("Один запрос: до 100 статей и 5000 карточек")
        if sum(len(a.body) for a in articles) > 1_000_000:
            raise ValueError("Один запрос: до 1 000 000 символов теории")
        return self


class AgentCourseUpdate(AgentCourseWrite):
    revision: str = Field(min_length=64, max_length=64)


class AgentStructureDelete(BaseModel):
    model_config = ConfigDict(extra="forbid")
    revision: str = Field(min_length=64, max_length=64)
    confirm: Literal[True]


class AgentArticleDetail(BaseModel):
    id: UUID
    title: str
    body: str
    position: int
    material: AgentSetDetail


class AgentSectionDetail(BaseModel):
    id: UUID
    title: str
    position: int
    articles: list[AgentArticleDetail]


class AgentCourseDetail(CourseSummary):
    revision: str
    sections: list[AgentSectionDetail]
