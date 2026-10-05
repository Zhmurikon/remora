"""Публичный контракт битв: правильные ответы скрыты до общего финиша."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.battles import BattleFinishReason, BattleStatus
from app.models.content import ContentType
from app.models.study import StudyDirection

MIN_BATTLE_QUESTIONS = 4
MAX_BATTLE_QUESTIONS = 20


class BattleCreate(BaseModel):
    set_id: UUID
    request_key: UUID
    question_count: int = Field(default=10, ge=MIN_BATTLE_QUESTIONS, le=MAX_BATTLE_QUESTIONS)
    direction: StudyDirection = StudyDirection.term_to_def


class BattleJoin(BaseModel):
    invite_token: str = Field(min_length=20, max_length=2000)


class BattleRematch(BaseModel):
    request_key: UUID


class BattleAnswerIn(BaseModel):
    client_answer_id: UUID
    question_id: str = Field(min_length=1, max_length=120)
    value: str = Field(max_length=4000)


class BattleQuestionOut(BaseModel):
    id: str
    card_id: UUID
    direction: StudyDirection
    prompt: str
    content_type: ContentType
    code_language: str | None = None
    prompt_image_url: str | None = None
    hint: str | None = None
    options: list[str]


class BattleParticipantOut(BaseModel):
    user_id: UUID
    username: str
    display_name: str | None
    avatar_url: str | None
    slot: int
    ready: bool
    answered_count: int
    correct_count: int | None = None
    finished_at: datetime | None = None
    duration_ms: int | None = None
    is_current: bool


class BattleRoomOut(BaseModel):
    id: UUID
    set_id: UUID
    set_title: str
    status: BattleStatus
    direction: StudyDirection
    question_count: int
    questions: list[BattleQuestionOut]
    participants: list[BattleParticipantOut]
    server_now: datetime
    starts_at: datetime | None
    deadline_at: datetime | None
    finished_at: datetime | None
    winner_id: UUID | None
    is_draw: bool
    finish_reason: BattleFinishReason | None


class BattleCreateOut(BattleRoomOut):
    invite_token: str


class BattleAnswerOut(BaseModel):
    accepted: bool
    duplicate: bool
    room: BattleRoomOut


class BattleQuestionReview(BaseModel):
    question_id: str
    given: str
    expected: str
    correct: bool


class BattleResultOut(BattleRoomOut):
    review: list[BattleQuestionReview]
