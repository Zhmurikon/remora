"""Схемы режима «Тест».

Правильные ответы живут только в `test_attempts.questions` на сервере.
В `TestQuestionOut` их нет — иначе тест решался бы через инструменты разработчика.
"""

from datetime import datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, Field

from app.core.answers import AnswerVerdict
from app.models.content import ContentType
from app.models.study import StudyDirection
from app.schemas.study import DirectionMode


class TestQuestionKind(StrEnum):
    choice = "choice"
    true_false = "true_false"
    typing = "typing"
    matching = "matching"


class TestSource(StrEnum):
    """Из каких карточек собирать тест."""

    all = "all"
    hard = "hard"
    new = "new"


# Верхняя граница совпадает с ключом лимита test.questions_max (docs/04-limits.md).
# До появления Entitlements в E9 это просто потолок схемы.
MAX_QUESTIONS = 50
MATCHING_GROUP_SIZE = 5


class TestConfig(BaseModel):
    question_count: int = Field(default=20, ge=1, le=MAX_QUESTIONS)
    kinds: list[TestQuestionKind] = Field(
        default=[TestQuestionKind.choice, TestQuestionKind.true_false, TestQuestionKind.typing],
        min_length=1,
    )
    direction: DirectionMode = DirectionMode.term_to_def
    source: TestSource = TestSource.all
    write_to_schedule: bool = True


class MatchingPair(BaseModel):
    """Одна строка сопоставления. Порядок правой колонки перемешан отдельно."""

    left: str
    right: str


class TestQuestionOut(BaseModel):
    id: str
    kind: TestQuestionKind
    card_id: UUID
    direction: StudyDirection
    prompt: str
    content_type: ContentType
    code_language: str | None = None
    prompt_image_url: str | None = None
    hint: str | None = None
    # choice: варианты; matching: правая колонка в перемешанном порядке
    options: list[str] = Field(default_factory=list)
    # true_false: утверждение, которое нужно оценить
    statement: str | None = None
    # matching: левая колонка
    pairs: list[str] = Field(default_factory=list)


class TestAttemptOut(BaseModel):
    id: UUID
    set_id: UUID
    set_title: str
    config: TestConfig
    questions: list[TestQuestionOut]
    created_at: datetime
    finished_at: datetime | None
    score: float | None
    correct_count: int
    retake_of_id: UUID | None = None


class TestAnswerIn(BaseModel):
    question_id: str
    # choice/typing: строка; true_false: «true»/«false»; matching: список ответов по строкам
    value: str | None = None
    values: list[str] = Field(default_factory=list)


class TestSubmit(BaseModel):
    answers: list[TestAnswerIn] = Field(max_length=MAX_QUESTIONS)


class TestQuestionReview(BaseModel):
    """Разбор одного вопроса после проверки."""

    question: TestQuestionOut
    correct: bool
    verdict: AnswerVerdict
    given: str | None
    given_values: list[str] = Field(default_factory=list)
    expected: str
    expected_values: list[str] = Field(default_factory=list)


class TestResult(BaseModel):
    attempt_id: UUID
    set_id: UUID
    score: float
    correct_count: int
    total: int
    finished_at: datetime
    review: list[TestQuestionReview]
    # Карточки, на которых ошиблись: из них собирается пересдача.
    wrong_card_ids: list[UUID]
