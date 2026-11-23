from datetime import datetime
from typing import Literal, Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, model_validator

from app.models.content import SetVisibility
from app.schemas.content import CardPublic, CardWrite, FolderPublic, SetDetail
from app.schemas.courses import CourseMetadata, CourseSummary


class AgentCardWrite(CardWrite):
    term: str = Field(max_length=10_000, pattern=r"\S")
    definition: str = Field(max_length=10_000, pattern=r"\S")


class AgentSetWrite(CourseMetadata):
    visibility: SetVisibility = SetVisibility.public
    model_config = ConfigDict(extra="forbid")
    lang_term: str = Field(default="ru", min_length=2, max_length=10)
    lang_definition: str = Field(default="ru", min_length=2, max_length=10)
    folder_id: UUID | None = None
    cards: list[AgentCardWrite] = Field(
        default_factory=list,
        max_length=5000,
        description=(
            "При обновлении пропустите поле для сохранения карточек. "
            "Явный массив заменяет колоду, [] очищает её."
        ),
    )


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


class AgentCourseCreate(AgentCourseWrite):
    is_published: bool = True


class AgentCourseUpdate(AgentCourseWrite):
    revision: str = Field(min_length=64, max_length=64)


class AgentStructureDelete(BaseModel):
    model_config = ConfigDict(extra="forbid")
    revision: str = Field(min_length=64, max_length=64)
    confirm: Literal[True]


class AgentFolderCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=1, max_length=100)
    color: str = Field(default="lime", pattern=r"^(lime|blue|violet|orange|rose)$")
    parent_id: UUID | None = None


class AgentFolderUpdate(AgentFolderCreate):
    position: int = Field(ge=0)
    revision: str = Field(min_length=64, max_length=64)


class AgentFolderDelete(BaseModel):
    model_config = ConfigDict(extra="forbid")
    revision: str = Field(min_length=64, max_length=64)
    confirm: Literal[True]


class AgentFolderDetail(FolderPublic):
    revision: str


class AgentMediaUpload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    source_url: HttpUrl | None = None
    data_base64: str | None = Field(default=None, max_length=14_000_000)
    filename: str | None = Field(default=None, min_length=1, max_length=255)
    mime: str | None = Field(default=None, max_length=100)
    alt: str = Field(default="Изображение", max_length=500)

    @model_validator(mode="after")
    def exactly_one_source(self) -> Self:
        if (self.source_url is None) == (self.data_base64 is None):
            raise ValueError("Укажите ровно один источник: source_url или data_base64")
        if self.data_base64 is not None and not self.mime:
            raise ValueError("Для data_base64 укажите mime")
        return self


class AgentMediaUploadResult(BaseModel):
    id: UUID
    mime: str
    size_bytes: int
    width: int | None
    height: int | None
    markdown_reference: str


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


class SetMove(BaseModel):
    model_config = ConfigDict(extra="forbid")
    folder_id: UUID | None
    revision: str = Field(min_length=64, max_length=64)


class CardAppend(BaseModel):
    model_config = ConfigDict(extra="forbid")
    revision: str = Field(min_length=64, max_length=64)
    cards: list[AgentCardWrite] = Field(min_length=1, max_length=500)


class CardChanges(BaseModel):
    model_config = ConfigDict(extra="forbid")
    term: str | None = Field(default=None, max_length=10_000, pattern=r"\S")
    definition: str | None = Field(default=None, max_length=10_000, pattern=r"\S")
    hint: str | None = Field(default=None, max_length=1000)
    term_transcription: str | None = Field(default=None, max_length=300)
    definition_transcription: str | None = Field(default=None, max_length=300)
    content_type: Literal["text", "code", "latex"] | None = None
    code_language: str | None = Field(default=None, max_length=50)
    term_image_id: UUID | None = None
    definition_image_id: UUID | None = None
    wrong_term_answers: list[str] | None = Field(default=None, max_length=30)
    wrong_definition_answers: list[str] | None = Field(default=None, max_length=30)
    alt_answers: list[str] | None = Field(default=None, max_length=30)

    @model_validator(mode="after")
    def require_changes(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("Передайте хотя бы одно изменение карточки")
        return self


class CardEdit(BaseModel):
    model_config = ConfigDict(extra="forbid")
    revision: str = Field(min_length=64, max_length=64)
    changes: CardChanges


class SetEditResult(BaseModel):
    set_id: UUID
    revision: str
    folder_id: UUID | None
    cards_count: int
    card_ids: list[UUID]


class CardPage(BaseModel):
    revision: str
    total: int
    cards: list[CardPublic]


class AgentConnection(BaseModel):
    scopes: list[str]
    plan: str
    private_materials: bool
    weekly_writes_used: int
    weekly_writes_remaining: int | None
    resets_at: datetime | None
