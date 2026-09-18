"""Схемы движка обучения."""

from datetime import datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.core.answers import Strictness
from app.models.content import ContentType
from app.models.study import CardStateKind, SessionStatus, StudyDirection, StudyMode


class QueueScope(StrEnum):
    """Что класть в очередь. `due` — режим «Заучивание», остальное — фильтры «Карточек»."""

    due = "due"
    all = "all"
    hard = "hard"
    new = "new"


class DirectionMode(StrEnum):
    """Направление тренировки. `both` разворачивается в два состояния на карточку."""

    term_to_def = "term_to_def"
    def_to_term = "def_to_term"
    both = "both"


class RatingPreviewOut(BaseModel):
    """Подпись на кнопке самооценки: когда карточка вернётся при такой оценке."""

    rating: int
    due_at: datetime
    interval_seconds: int


class CardStateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    card_id: UUID
    direction: StudyDirection
    state: CardStateKind
    stability: float | None
    difficulty: float | None
    due_at: datetime
    last_reviewed_at: datetime | None
    reps: int
    lapses: int
    suspended_at: datetime | None = None


class QueueCard(BaseModel):
    """Карточка в том виде, в каком её показывает тренировка."""

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
    alt_answers: list[str] = Field(default_factory=list)
    wrong_term_answers: list[str] = Field(default_factory=list)
    wrong_definition_answers: list[str] = Field(default_factory=list)


class QueueItem(BaseModel):
    card: QueueCard
    direction: StudyDirection
    state: CardStateOut
    previews: list[RatingPreviewOut]


class StudyQueue(BaseModel):
    """Всё, что нужно тренировке на одну сессию, одним запросом.

    Языки сторон и строгость лежат здесь, а не запрашиваются отдельно: без них
    клиент не может проверить ответ теми же правилами, что и сервер.
    """

    set_id: UUID
    set_title: str
    lang_term: str
    lang_definition: str
    answer_strictness: Strictness
    mode: StudyMode
    generated_at: datetime
    scheduler_version: str
    items: list[QueueItem]
    due_total: int
    new_total: int
    new_left_today: int
    reviews_left_today: int


class ReviewIn(BaseModel):
    """Один ответ. `client_review_id` генерирует клиент — он же ключ идемпотентности."""

    client_review_id: UUID
    card_id: UUID
    direction: StudyDirection
    mode: StudyMode
    rating: int = Field(ge=1, le=4)
    answer_correct: bool | None = None
    duration_ms: int | None = Field(default=None, ge=0, le=3_600_000)
    reviewed_at: datetime


class ReviewBatch(BaseModel):
    session_id: UUID | None = None
    reviews: list[ReviewIn] = Field(min_length=1, max_length=200)


class ReviewBatchResult(BaseModel):
    accepted: list[UUID]
    duplicates: list[UUID]
    rejected: list[UUID]
    states: list[CardStateOut]


class SessionCreate(BaseModel):
    set_id: UUID
    mode: StudyMode
    config: dict[str, object] = Field(default_factory=dict)


class SessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    set_id: UUID
    mode: StudyMode
    status: SessionStatus
    started_at: datetime
    ended_at: datetime | None
    cards_seen: int
    cards_correct: int
    config: dict[str, object]


class StateDistribution(BaseModel):
    new: int = 0
    learning: int = 0
    review: int = 0
    relearning: int = 0


class ProblemCard(BaseModel):
    card_id: UUID
    term: str
    definition: str
    lapses: int
    reps: int
    retrievability: float


class ForecastDay(BaseModel):
    date: str
    count: int


class SetStats(BaseModel):
    set_id: UUID
    cards_total: int
    mastered_count: int
    learning_count: int
    not_started_count: int
    mastery_percent: float
    due_now: int
    last_studied_at: datetime | None
    distribution: StateDistribution
    problem_cards: list[ProblemCard]
    forecast: list[ForecastDay]


class StudySettingsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    daily_goal_cards: int
    fsrs_desired_retention: float
    fsrs_max_interval_days: int
    new_cards_per_day: int
    reviews_per_day: int
    answer_strictness: Strictness


class StudySettingsUpdate(BaseModel):
    daily_goal_cards: int | None = Field(default=None, ge=1, le=500)
    fsrs_desired_retention: float | None = Field(default=None, ge=0.70, le=0.98)
    fsrs_max_interval_days: int | None = Field(default=None, ge=1, le=36500)
    new_cards_per_day: int | None = Field(default=None, ge=0, le=500)
    reviews_per_day: int | None = Field(default=None, ge=0, le=2000)
    answer_strictness: Strictness | None = None
