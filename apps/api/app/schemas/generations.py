from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.core.distractors import normalize_option

GenerationKind = Literal["notes", "cards"]


class GeneratedCard(BaseModel):
    model_config = ConfigDict(extra="forbid")
    term: str = Field(min_length=1, max_length=160)
    definition: str = Field(min_length=1, max_length=1000)
    wrong_definition_answers: list[Annotated[str, Field(max_length=1000)]] = Field(
        min_length=3, max_length=3
    )


class GeneratedCards(BaseModel):
    model_config = ConfigDict(extra="forbid")
    cards: list[GeneratedCard] = Field(max_length=12)


def card_issues(cards: list[GeneratedCard]) -> list[str]:
    issues: list[str] = []
    seen: set[str] = set()
    for index, card in enumerate(cards, 1):
        term = normalize_option(card.term)
        options = [card.definition, *card.wrong_definition_answers]
        normalized = [normalize_option(value) for value in options]
        if not term or len(card.term.split()) > 5 or term in seen:
            issues.append(f"Карточка {index}: нужен уникальный термин из 1–5 слов")
        seen.add(term)
        if not all(normalized) or len(set(normalized)) != 4:
            issues.append(f"Карточка {index}: определения должны быть непустыми и разными")
        lengths = [len(value.strip()) for value in options]
        if lengths[0] >= max(lengths[1:]):
            issues.append(f"Карточка {index}: правильное определение не должно быть самым длинным")
        if min(lengths) and max(lengths) / min(lengths) > 1.6:
            issues.append(f"Карточка {index}: сделайте определения сопоставимыми по длине")
        if max(lengths) > 1000:
            issues.append(f"Карточка {index}: определение длиннее 1000 символов")
    return issues


class GenerationCreate(BaseModel):
    request_id: UUID
    kind: GenerationKind
    parent_id: UUID | None = None


class GenerationUpdate(BaseModel):
    revision: datetime
    markdown: str | None = Field(default=None, min_length=1, max_length=100_000)
    cards: list[GeneratedCard] | None = Field(default=None, max_length=12)


class GenerationSaveSet(BaseModel):
    revision: datetime
    title: str = Field(min_length=1, max_length=160)


class GenerationPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    transcription_id: UUID
    kind: GenerationKind
    status: Literal["queued", "processing", "completed", "failed"]
    title: str
    parent_id: UUID | None
    source_hash: str
    markdown: str | None
    cards: list[GeneratedCard] | None
    error_message: str | None
    saved_set_id: UUID | None
    created_at: datetime
    updated_at: datetime
    issues: list[str] = Field(default_factory=list)
