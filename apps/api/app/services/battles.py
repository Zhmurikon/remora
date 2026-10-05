"""Серверная машина состояний соревновательной битвы 1×1."""

from __future__ import annotations

import random
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid5

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.distractors import generate_options, normalize_option
from app.core.errors import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.core.security import create_jwt, decode_jwt
from app.core.storage import get_object_storage
from app.models.battles import (
    Battle,
    BattleFinishReason,
    BattleParticipant,
    BattleStatus,
)
from app.models.content import Card, MediaStatus, SetVisibility, StudySet
from app.models.study import StudyDirection, StudyMode
from app.models.user import User
from app.repositories import battles as repo
from app.repositories import content as content_repo
from app.repositories import study as study_repo
from app.schemas.battles import (
    BattleAnswerIn,
    BattleAnswerOut,
    BattleCreate,
    BattleCreateOut,
    BattleParticipantOut,
    BattleQuestionOut,
    BattleQuestionReview,
    BattleResultOut,
    BattleRoomOut,
)
from app.schemas.study import ReviewIn
from app.services.retention import RetentionService
from app.services.scheduler import SCHEDULER_VERSION

INVITE_WINDOW = timedelta(minutes=10)
COUNTDOWN = timedelta(seconds=3)
SECONDS_PER_QUESTION = 30
DRAW_THRESHOLD_MS = 500
REVIEW_NAMESPACE = UUID("31bdffab-5075-4ac5-af04-c782c7214939")


class BattleService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create(self, user: User, body: BattleCreate) -> BattleCreateOut:
        await repo.lock_creator(self.db, user.id)
        existing = await repo.by_request_key(self.db, user.id, body.request_key)
        if existing is not None:
            await self._advance(existing, _now())
            return await self._create_out(user, existing)

        study_set = await self._available_set(user, body.set_id, with_cards=True)
        questions = _build_questions(
            battle_id=body.request_key,
            cards=study_set.cards,
            direction=body.direction,
            count=body.question_count,
        )
        battle = Battle(
            creator_id=user.id,
            set_id=study_set.id,
            request_key=body.request_key,
            direction=body.direction,
            question_count=len(questions),
            questions=questions,
        )
        self.db.add(battle)
        await self.db.flush()
        self.db.add(BattleParticipant(battle_id=battle.id, user_id=user.id, slot=1))
        await self.db.flush()
        return await self._create_out(user, battle)

    async def join(self, user: User, invite_token: str) -> BattleRoomOut:
        payload = decode_jwt(invite_token, "battle_invite")
        if payload is None:
            raise ValidationError("Ссылка-приглашение недействительна или устарела")
        battle_id = UUID(payload["sub"])
        battle = await repo.for_update(self.db, battle_id)
        if battle is None:
            raise NotFoundError("Битва не найдена")
        now = _now()
        await self._advance(battle, now)
        if battle.status is BattleStatus.expired:
            raise ConflictError("Срок приглашения истёк")
        existing = await repo.participant(self.db, battle.id, user.id)
        if existing is None:
            if battle.creator_id == user.id:
                raise ConflictError("Создатель уже участвует в этой битве")
            if battle.status is not BattleStatus.waiting:
                raise ConflictError("К этой битве уже нельзя присоединиться")
            participants = await repo.participants(self.db, battle.id)
            if len(participants) >= 2:
                raise ConflictError("В битве уже два участника")
            await self._available_set(user, battle.set_id, with_cards=False)
            existing = BattleParticipant(battle_id=battle.id, user_id=user.id, slot=2)
            self.db.add(existing)
            await self.db.flush()
        return await self._room(user, battle, now)

    async def get(self, user: User, battle_id: UUID) -> BattleRoomOut:
        battle, participant = await self._owned_room(user, battle_id)
        now = _now()
        participant.last_seen_at = now
        await self._advance(battle, now)
        return await self._room(user, battle, now)

    async def ready(self, user: User, battle_id: UUID) -> BattleRoomOut:
        battle, participant = await self._owned_room(user, battle_id)
        now = _now()
        await self._advance(battle, now)
        if battle.status not in {BattleStatus.waiting, BattleStatus.countdown}:
            raise ConflictError("Битва уже началась или завершена")
        participant.ready_at = participant.ready_at or now
        participant.last_seen_at = now
        await self.db.flush()
        participants = await repo.participants(self.db, battle.id)
        if len(participants) == 2 and all(item.ready_at is not None for item in participants):
            battle.status = BattleStatus.countdown
            battle.starts_at = now + COUNTDOWN
            battle.deadline_at = battle.starts_at + timedelta(
                seconds=battle.question_count * SECONDS_PER_QUESTION
            )
            await self.db.flush()
        return await self._room(user, battle, now)

    async def answer(self, user: User, battle_id: UUID, body: BattleAnswerIn) -> BattleAnswerOut:
        battle, participant = await self._owned_room(user, battle_id)
        now = _now()
        await self._advance(battle, now)
        duplicate = await repo.answer_by_client_id(self.db, participant.id, body.client_answer_id)
        if duplicate is not None:
            return BattleAnswerOut(
                accepted=True,
                duplicate=True,
                room=await self._room(user, battle, now),
            )
        if battle.status is not BattleStatus.active:
            raise ConflictError("Сейчас ответы не принимаются")
        question = next(
            (item for item in battle.questions if str(item["id"]) == body.question_id), None
        )
        if question is None:
            raise ValidationError("Вопрос не относится к этой битве")
        if await repo.answer_by_question(self.db, participant.id, body.question_id) is not None:
            raise ConflictError("На этот вопрос уже дан ответ")

        previous_answers = await repo.answers(self.db, participant.id)
        previous_at = previous_answers[-1].answered_at if previous_answers else battle.starts_at
        duration_ms = (
            max(0, int((now - previous_at).total_seconds() * 1000))
            if previous_at is not None
            else None
        )
        correct = normalize_option(body.value) == normalize_option(str(question["answer"]))
        inserted = await repo.insert_answer(
            self.db,
            {
                "participant_id": participant.id,
                "question_id": body.question_id,
                "client_answer_id": body.client_answer_id,
                "value": body.value,
                "correct": correct,
                "answered_at": now,
            },
        )
        if not inserted:
            raise ConflictError("Ответ уже был принят")
        participant.answered_count += 1
        participant.correct_count += int(correct)
        participant.last_seen_at = now
        if participant.answered_count == battle.question_count:
            participant.finished_at = now
            participant.duration_ms = _elapsed_ms(battle.starts_at, now)
        await self.db.flush()

        review = ReviewIn(
            client_review_id=uuid5(
                REVIEW_NAMESPACE,
                f"{battle.id}:{participant.id}:{body.question_id}",
            ),
            card_id=UUID(str(question["card_id"])),
            direction=StudyDirection(str(question["direction"])),
            mode=StudyMode.battle,
            rating=3 if correct else 1,
            answer_correct=correct,
            duration_ms=duration_ms,
            updates_schedule=False,
            reviewed_at=now,
        )
        await self._record_review(user, battle, review)
        await self._finish_if_complete(battle, now)
        return BattleAnswerOut(
            accepted=True,
            duplicate=False,
            room=await self._room(user, battle, now),
        )

    async def result(self, user: User, battle_id: UUID) -> BattleResultOut:
        battle, participant = await self._owned_room(user, battle_id)
        now = _now()
        await self._advance(battle, now)
        if battle.status is not BattleStatus.finished:
            raise ConflictError("Битва ещё не завершена")
        answers = {item.question_id: item for item in await repo.answers(self.db, participant.id)}
        room = await self._room(user, battle, now)
        return BattleResultOut(
            **room.model_dump(),
            review=[
                BattleQuestionReview(
                    question_id=str(question["id"]),
                    given=answers[str(question["id"])].value
                    if str(question["id"]) in answers
                    else "",
                    expected=str(question["answer"]),
                    correct=answers[str(question["id"])].correct
                    if str(question["id"]) in answers
                    else False,
                )
                for question in battle.questions
            ],
        )

    async def leave(self, user: User, battle_id: UUID) -> BattleRoomOut:
        battle, participant = await self._owned_room(user, battle_id)
        now = _now()
        await self._advance(battle, now)
        if battle.status in {BattleStatus.waiting, BattleStatus.countdown}:
            battle.status = BattleStatus.cancelled
            battle.finished_at = now
        elif battle.status is BattleStatus.active and participant.finished_at is None:
            participant.finished_at = now
            participant.duration_ms = _elapsed_ms(battle.starts_at, now)
            await self._finish_if_complete(battle, now)
        await self.db.flush()
        return await self._room(user, battle, now)

    async def rematch(self, user: User, battle_id: UUID, request_key: UUID) -> BattleCreateOut:
        battle, _ = await self._owned_room(user, battle_id)
        await self._advance(battle, _now())
        if battle.status is not BattleStatus.finished:
            raise ConflictError("Реванш доступен после завершения битвы")
        created = await self.create(
            user,
            BattleCreate(
                set_id=battle.set_id,
                request_key=request_key,
                question_count=battle.question_count,
                direction=battle.direction,
            ),
        )
        new_battle = await repo.for_update(self.db, created.id)
        if new_battle is not None and new_battle.rematch_of_id is None:
            new_battle.rematch_of_id = battle.id
            await self.db.flush()
        return created

    async def _owned_room(self, user: User, battle_id: UUID) -> tuple[Battle, BattleParticipant]:
        battle = await repo.for_update(self.db, battle_id)
        if battle is None:
            raise NotFoundError("Битва не найдена")
        participant = await repo.participant(self.db, battle.id, user.id)
        if participant is None:
            raise ForbiddenError("Нет доступа к этой битве")
        return battle, participant

    async def _available_set(self, user: User, set_id: UUID, *, with_cards: bool) -> StudySet:
        study_set = await content_repo.get_set(self.db, set_id, with_cards=with_cards)
        if study_set is None:
            raise NotFoundError("Набор не найден")
        if study_set.visibility is not SetVisibility.public:
            raise ConflictError("Битвы доступны только для публичных наборов")
        return study_set

    async def _record_review(self, user: User, battle: Battle, review: ReviewIn) -> None:
        """Пишет активность без доступа к FSRS: битва — отдельный публичный контекст."""
        stored = await study_repo.insert_review(
            self.db,
            {
                "user_id": user.id,
                "card_id": review.card_id,
                "set_id": battle.set_id,
                "direction": review.direction,
                "session_id": None,
                "client_review_id": review.client_review_id,
                "mode": review.mode,
                "rating": review.rating,
                "answer_correct": review.answer_correct,
                "duration_ms": review.duration_ms,
                "updates_schedule": False,
                "reviewed_at": review.reviewed_at,
                "state_before": {},
                "state_after": {},
                "scheduler_version": SCHEDULER_VERSION,
            },
        )
        if stored:
            await RetentionService(self.db).record_reviews(user, [review])

    async def _advance(self, battle: Battle, now: datetime) -> None:
        if battle.status is BattleStatus.waiting and battle.created_at + INVITE_WINDOW <= now:
            battle.status = BattleStatus.expired
        elif (
            battle.status is BattleStatus.countdown
            and battle.starts_at is not None
            and battle.starts_at <= now
        ):
            battle.status = BattleStatus.active
        if (
            battle.status is BattleStatus.active
            and battle.deadline_at is not None
            and battle.deadline_at <= now
        ):
            await self._finish_timeout(battle)
        await self.db.flush()

    async def _finish_if_complete(self, battle: Battle, now: datetime) -> None:
        participants = await repo.participants(self.db, battle.id)
        if len(participants) == 2 and all(item.finished_at is not None for item in participants):
            self._complete(battle, participants, now, BattleFinishReason.completed)
            await self.db.flush()

    async def _finish_timeout(self, battle: Battle) -> None:
        participants = await repo.participants(self.db, battle.id)
        if battle.deadline_at is None:
            return
        for item in participants:
            if item.finished_at is None:
                item.finished_at = battle.deadline_at
                item.duration_ms = _elapsed_ms(battle.starts_at, battle.deadline_at)
        self._complete(battle, participants, battle.deadline_at, BattleFinishReason.timeout)

    def _complete(
        self,
        battle: Battle,
        participants: list[BattleParticipant],
        finished_at: datetime,
        reason: BattleFinishReason,
    ) -> None:
        battle.status = BattleStatus.finished
        battle.finished_at = finished_at
        battle.finish_reason = reason
        battle.winner_id = _winner(participants)

    async def _create_out(self, user: User, battle: Battle) -> BattleCreateOut:
        room = await self._room(user, battle, _now())
        return BattleCreateOut(
            **room.model_dump(),
            invite_token=create_jwt(str(battle.id), "battle_invite"),
        )

    async def _room(self, user: User, battle: Battle, now: datetime) -> BattleRoomOut:
        study_set = await repo.set_for_battle(self.db, battle.set_id)
        if study_set is None:
            raise NotFoundError("Набор не найден")
        participant_rows = await repo.participants(self.db, battle.id)
        users = await repo.participant_users(self.db, participant_rows)
        reveal = battle.status is BattleStatus.finished
        return BattleRoomOut(
            id=battle.id,
            set_id=battle.set_id,
            set_title=study_set.title,
            status=battle.status,
            direction=battle.direction,
            question_count=battle.question_count,
            questions=[await self._question_out(question) for question in battle.questions],
            participants=[
                BattleParticipantOut(
                    user_id=item.user_id,
                    username=users[item.user_id].username,
                    display_name=users[item.user_id].display_name,
                    avatar_url=users[item.user_id].avatar_url,
                    slot=item.slot,
                    ready=item.ready_at is not None,
                    answered_count=item.answered_count,
                    correct_count=item.correct_count if reveal else None,
                    finished_at=item.finished_at if reveal else None,
                    duration_ms=item.duration_ms if reveal else None,
                    is_current=item.user_id == user.id,
                )
                for item in participant_rows
            ],
            server_now=now,
            starts_at=battle.starts_at,
            deadline_at=battle.deadline_at,
            finished_at=battle.finished_at,
            winner_id=battle.winner_id if reveal else None,
            is_draw=reveal and battle.winner_id is None,
            finish_reason=battle.finish_reason if reveal else None,
        )

    async def _question_out(self, question: dict[str, Any]) -> BattleQuestionOut:
        return BattleQuestionOut(
            id=str(question["id"]),
            card_id=UUID(str(question["card_id"])),
            direction=StudyDirection(str(question["direction"])),
            prompt=str(question["prompt"]),
            content_type=str(question["content_type"]),
            code_language=question.get("code_language"),
            prompt_image_url=await _image_url(self.db, question.get("prompt_image_id")),
            hint=question.get("hint"),
            options=list(question["options"]),
        )


def _build_questions(
    *, battle_id: UUID, cards: list[Card], direction: StudyDirection, count: int
) -> list[dict[str, Any]]:
    rng = random.Random(battle_id.int)
    shuffled = list(cards)
    rng.shuffle(shuffled)
    pool = [_answer(card, direction) for card in cards]
    questions: list[dict[str, Any]] = []
    for card in shuffled:
        answer = _answer(card, direction)
        options = generate_options(
            answer,
            [
                candidate
                for candidate in pool
                if normalize_option(candidate) != normalize_option(answer)
            ],
            rng=rng,
            alternatives=card.alt_answers or [],
            preferred=(
                card.wrong_definition_answers
                if direction is StudyDirection.term_to_def
                else card.wrong_term_answers
            )
            or [],
        )
        if len(options) != 4:
            continue
        questions.append(
            {
                "id": f"{card.id}:{direction.value}",
                "card_id": str(card.id),
                "direction": direction.value,
                "prompt": _prompt(card, direction),
                "answer": answer,
                "content_type": card.content_type.value,
                "code_language": card.code_language,
                "prompt_image_id": str(_prompt_image(card, direction))
                if _prompt_image(card, direction)
                else None,
                "hint": card.hint,
                "options": options,
            }
        )
        if len(questions) == count:
            break
    if len(questions) != count:
        raise ConflictError(
            "В наборе недостаточно карточек с уникальными вариантами ответа",
            details={"available": len(questions), "required": count},
        )
    return questions


def _winner(participants: list[BattleParticipant]) -> UUID | None:
    if len(participants) != 2:
        return None
    first, second = participants
    if first.correct_count != second.correct_count:
        return first.user_id if first.correct_count > second.correct_count else second.user_id
    first_time = first.duration_ms or 0
    second_time = second.duration_ms or 0
    if abs(first_time - second_time) <= DRAW_THRESHOLD_MS:
        return None
    return first.user_id if first_time < second_time else second.user_id


def _prompt(card: Card, direction: StudyDirection) -> str:
    return card.term if direction is StudyDirection.term_to_def else card.definition


def _answer(card: Card, direction: StudyDirection) -> str:
    return card.definition if direction is StudyDirection.term_to_def else card.term


def _prompt_image(card: Card, direction: StudyDirection) -> UUID | None:
    return (
        card.term_image_id if direction is StudyDirection.term_to_def else card.definition_image_id
    )


async def _image_url(db: AsyncSession, asset_id: str | None) -> str | None:
    if asset_id is None:
        return None
    asset = await content_repo.get_media_asset(db, UUID(asset_id))
    if asset is None or asset.status is not MediaStatus.ready:
        return None
    return get_object_storage().download_url(
        asset.s3_key, get_settings().media_download_ttl_seconds
    )


def _elapsed_ms(start: datetime | None, end: datetime) -> int | None:
    return max(0, int((end - start).total_seconds() * 1000)) if start is not None else None


def _now() -> datetime:
    return datetime.now(tz=UTC)
