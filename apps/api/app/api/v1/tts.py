"""Озвучка карточек.

Эндпоинты отвечают на один вопрос: «дай ссылку на аудио для этого текста».
Синтез вызывается только при промахе глобального кэша, и только он тратит
квоту символов.
"""

from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import current_user
from app.core.errors import NotFoundError
from app.db.session import get_db
from app.models.study import StudyDirection
from app.models.tts import UsageMetric
from app.models.user import User
from app.repositories import study as study_repo
from app.services.content import ContentService
from app.services.tts import DEFAULT_VOICES, MAX_SPEED, MIN_SPEED, TtsService

router = APIRouter(prefix="/tts", tags=["tts"])


class SpeakRequest(BaseModel):
    card_id: UUID
    # Какую сторону озвучиваем. Направление задаёт и язык голоса.
    direction: StudyDirection = StudyDirection.term_to_def
    side: str = Field(default="question", pattern="^(question|answer)$")
    voice: str | None = Field(default=None, max_length=32)
    speed: float = Field(default=1.0, ge=MIN_SPEED, le=MAX_SPEED)


class SpeakResponse(BaseModel):
    audio_url: str
    cached: bool
    voice: str
    lang: str


class TtsStatus(BaseModel):
    available: bool
    chars_used_this_month: int
    voices: dict[str, str]


@router.get("/status", response_model=TtsStatus, summary="Доступна ли озвучка")
async def tts_status(
    user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> TtsStatus:
    service = TtsService(db)
    return TtsStatus(
        available=service.available,
        chars_used_this_month=await service.usage(user.id, UsageMetric.tts_chars),
        voices=DEFAULT_VOICES,
    )


@router.post("/speak", response_model=SpeakResponse, summary="Озвучить сторону карточки")
async def speak(
    body: SpeakRequest,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> SpeakResponse:
    # Доступ проверяем по владельцу набора: чужие карточки озвучивать нельзя,
    # иначе через этот эндпоинт читался бы приватный контент.
    cards = await study_repo.cards_owned_by(db, user.id, [body.card_id])
    card = cards.get(body.card_id)
    if card is None:
        raise NotFoundError("Карточка не найдена")

    study_set = await ContentService(db).get_owned_set(user, card.set_id)
    term_side = (body.direction is StudyDirection.term_to_def) == (body.side == "question")
    text = card.term if term_side else card.definition
    lang = study_set.lang_term if term_side else study_set.lang_definition

    service = TtsService(db)
    asset, cached = await service.speak(
        user, text, lang=lang, voice=body.voice, speed=body.speed
    )
    return SpeakResponse(
        audio_url=service.download_url(asset),
        cached=cached,
        voice=service.resolve_voice(lang, body.voice),
        lang=lang,
    )
