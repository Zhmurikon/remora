"""Режим «Тест»: генерация вопросов, проверка и пересдача.

Три решения, которые определяют весь остальной код.

1. **Вопросы фиксируются на сервере.** Обновление вкладки посреди теста не
   должно менять вопросы, а ответы должны проверяться тем же составом, каким
   тест выдавался. Поэтому список лежит в `test_attempts.questions`.
2. **Правильные ответы клиенту не уходят.** Наружу отдаётся `TestQuestionOut`
   без поля `answer`; проверка целиком серверная.
3. **Проверка ответов — общим нормализатором.** Тот же `check_answer`, что
   в «Письме», иначе один и тот же ответ засчитывался бы по-разному.
"""

from __future__ import annotations

import random
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid5

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.answers import AnswerVerdict, Strictness, check_answer
from app.core.config import get_settings
from app.core.distractors import can_ask_multiple_choice, generate_options
from app.core.errors import ConflictError, ForbiddenError, NotFoundError
from app.core.storage import get_object_storage
from app.models.content import Card, MediaStatus, StudySet
from app.models.study import (
    CardState,
    CardStateKind,
    StudyDirection,
    StudyMode,
    TestAttempt,
)
from app.models.user import User
from app.repositories import content as content_repo
from app.repositories import study as study_repo
from app.repositories import user as user_repo
from app.schemas.study import DirectionMode
from app.schemas.test_mode import (
    MATCHING_GROUP_SIZE,
    TestAttemptOut,
    TestConfig,
    TestQuestionKind,
    TestQuestionOut,
    TestQuestionReview,
    TestResult,
    TestSource,
    TestSubmit,
)
from app.services.content import ContentService
from app.services.study import MASTERED_STABILITY_DAYS, StudyService

# Пространство имён для детерминированных client_review_id: повторная отправка
# результатов теста не должна писать в журнал второй раз.
REVIEW_NAMESPACE = UUID("6f2f2f4a-2a5b-4f3d-9f0e-0c1a2b3c4d5e")

# Сколько карточек нужно набору, чтобы вопрос с выбором имел смысл.
MIN_CARDS_FOR_CHOICE = 4


class TestModeService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.content = ContentService(db)
        self.study = StudyService(db)

    async def create_attempt(
        self, user: User, set_id: UUID, config: TestConfig, *, retake_of: UUID | None = None
    ) -> TestAttemptOut:
        study_set = await self.content.get_owned_set(user, set_id, with_cards=True)
        if not study_set.cards:
            raise ConflictError("В наборе нет карточек")

        cards = await self._pick_cards(user, study_set, config)
        if not cards:
            raise ConflictError("Под выбранный источник не нашлось карточек")

        # Сид от id попытки: один и тот же тест собирается одинаково при
        # повторной генерации, но у разных попыток вопросы разные.
        attempt_id = uuid5(REVIEW_NAMESPACE, f"{user.id}:{set_id}:{datetime.now(tz=UTC)}")
        rng = random.Random(attempt_id.int)
        questions = self._build_questions(study_set, cards, config, rng)

        attempt = TestAttempt(
            id=attempt_id,
            user_id=user.id,
            set_id=set_id,
            config=config.model_dump(mode="json"),
            questions=questions,
            answers=[],
            retake_of_id=retake_of,
        )
        self.db.add(attempt)
        await self.db.flush()
        return await self._to_out(study_set, attempt)

    async def get_attempt(self, user: User, attempt_id: UUID) -> TestAttemptOut:
        attempt = await self._owned_attempt(user, attempt_id)
        study_set = await self.content.get_owned_set(user, attempt.set_id, with_cards=True)
        return await self._to_out(study_set, attempt)

    async def submit(self, user: User, attempt_id: UUID, body: TestSubmit) -> TestResult:
        attempt = await self._owned_attempt(user, attempt_id)
        if attempt.finished_at is not None:
            # Повторная отправка возвращает тот же разбор, а не вторую попытку.
            return await self._result(user, attempt)

        settings = await user_repo.get_or_create_settings(self.db, user.id)
        study_set = await self.content.get_owned_set(user, attempt.set_id, with_cards=True)
        strictness = Strictness(settings.answer_strictness)
        given = {item.question_id: item for item in body.answers}

        checked: list[dict[str, Any]] = []
        for question in attempt.questions:
            answer = given.get(str(question["id"]))
            checked.append(
                _check_question(
                    question,
                    value=answer.value if answer else None,
                    values=answer.values if answer else [],
                    strictness=strictness,
                    lang=_answer_lang(study_set, StudyDirection(question["direction"])),
                )
            )

        attempt.answers = checked
        attempt.correct_count = sum(1 for item in checked if item["correct"])
        attempt.score = round(attempt.correct_count / len(checked) * 100, 1) if checked else 0.0
        attempt.finished_at = datetime.now(tz=UTC)
        await self.db.flush()

        if attempt.config.get("write_to_schedule", True):
            await self._record_reviews(user, attempt, checked)
        await self.study.recalculate_progress(user, attempt.set_id)
        return await self._result(user, attempt)

    async def get_raw_attempt(self, user: User, attempt_id: UUID) -> TestAttempt:
        """Попытка вместе с ответами. Только для печати: наружу в API не уходит."""
        return await self._owned_attempt(user, attempt_id)

    async def get_result(self, user: User, attempt_id: UUID) -> TestResult:
        attempt = await self._owned_attempt(user, attempt_id)
        if attempt.finished_at is None:
            raise ConflictError("Тест ещё не завершён")
        return await self._result(user, attempt)

    async def retake(self, user: User, attempt_id: UUID) -> TestAttemptOut:
        """Пересдача по ошибкам: те же настройки, только проваленные карточки."""
        attempt = await self._owned_attempt(user, attempt_id)
        if attempt.finished_at is None:
            raise ConflictError("Тест ещё не завершён")
        wrong_ids = _wrong_card_ids(attempt)
        if not wrong_ids:
            raise ConflictError("В этой попытке нет ошибок")

        study_set = await self.content.get_owned_set(user, attempt.set_id, with_cards=True)
        cards = [card for card in study_set.cards if card.id in wrong_ids]
        config = TestConfig.model_validate(attempt.config)
        config = config.model_copy(
            update={"question_count": min(len(cards), config.question_count)}
        )

        retake_id = uuid5(REVIEW_NAMESPACE, f"retake:{attempt.id}:{datetime.now(tz=UTC)}")
        rng = random.Random(retake_id.int)
        retake = TestAttempt(
            id=retake_id,
            user_id=user.id,
            set_id=attempt.set_id,
            config=config.model_dump(mode="json"),
            questions=self._build_questions(study_set, cards, config, rng),
            answers=[],
            retake_of_id=attempt.id,
        )
        self.db.add(retake)
        await self.db.flush()
        return await self._to_out(study_set, retake)

    # ------------------------------------------------------------------ сборка

    async def _pick_cards(
        self, user: User, study_set: StudySet, config: TestConfig
    ) -> list[Card]:
        cards = list(study_set.cards)
        if config.source is not TestSource.all:
            states = {
                state.card_id: state
                for state in await study_repo.list_states_for_set(self.db, user.id, study_set.id)
            }
            cards = [card for card in cards if _matches_source(config.source, states.get(card.id))]
        random.shuffle(cards)
        return cards[: config.question_count]

    def _build_questions(
        self,
        study_set: StudySet,
        cards: list[Card],
        config: TestConfig,
        rng: random.Random,
    ) -> list[dict[str, Any]]:
        directions = (
            [StudyDirection.term_to_def, StudyDirection.def_to_term]
            if config.direction is DirectionMode.both
            else [StudyDirection(config.direction.value)]
        )
        kinds = list(config.kinds)
        questions: list[dict[str, Any]] = []
        matching_bucket: list[tuple[Card, StudyDirection]] = []

        for position, card in enumerate(cards):
            direction = directions[position % len(directions)]
            pool = [
                _answer_side(other, direction)
                for other in study_set.cards
                if other is not card
            ]
            kind = _pick_kind(kinds, pool, rng)

            if kind is TestQuestionKind.matching:
                matching_bucket.append((card, direction))
                if len(matching_bucket) == MATCHING_GROUP_SIZE:
                    questions.append(_matching_question(matching_bucket, rng))
                    matching_bucket = []
                continue
            questions.append(_single_question(kind, card, direction, study_set, pool, rng))

        # Недобранная группа сопоставления: одна пара — не задание, разворачиваем
        # такие карточки в обычные вопросы с вводом.
        if len(matching_bucket) >= 2:
            questions.append(_matching_question(matching_bucket, rng))
        else:
            for card, direction in matching_bucket:
                questions.append(
                    _single_question(TestQuestionKind.typing, card, direction, study_set, [], rng)
                )
        rng.shuffle(questions)
        return questions

    # ------------------------------------------------------------------ выдача

    async def _to_out(self, study_set: StudySet, attempt: TestAttempt) -> TestAttemptOut:
        return TestAttemptOut(
            id=attempt.id,
            set_id=attempt.set_id,
            set_title=study_set.title,
            config=TestConfig.model_validate(attempt.config),
            questions=[
                await self._question_out(question) for question in attempt.questions
            ],
            created_at=attempt.created_at,
            finished_at=attempt.finished_at,
            score=attempt.score,
            correct_count=attempt.correct_count,
            retake_of_id=attempt.retake_of_id,
        )

    async def _question_out(self, question: dict[str, Any]) -> TestQuestionOut:
        return TestQuestionOut(
            id=str(question["id"]),
            kind=TestQuestionKind(question["kind"]),
            card_id=UUID(question["card_id"]),
            direction=StudyDirection(question["direction"]),
            prompt=question["prompt"],
            content_type=question["content_type"],
            code_language=question.get("code_language"),
            prompt_image_url=await self._image_url(question.get("prompt_image_id")),
            hint=question.get("hint"),
            options=list(question.get("options", [])),
            statement=question.get("statement"),
            pairs=list(question.get("pairs", [])),
        )

    async def _image_url(self, asset_id: str | None) -> str | None:
        if not asset_id:
            return None
        asset = await content_repo.get_media_asset(self.db, UUID(asset_id))
        if asset is None or asset.status != MediaStatus.ready:
            return None
        return get_object_storage().download_url(
            asset.s3_key, get_settings().media_download_ttl_seconds
        )

    async def _result(self, user: User, attempt: TestAttempt) -> TestResult:
        study_set = await self.content.get_owned_set(user, attempt.set_id, with_cards=True)
        by_id = {str(question["id"]): question for question in attempt.questions}
        review = []
        for item in attempt.answers:
            question = by_id.get(str(item["question_id"]))
            if question is None:
                continue
            review.append(
                TestQuestionReview(
                    question=await self._question_out(question),
                    correct=bool(item["correct"]),
                    verdict=AnswerVerdict(item["verdict"]),
                    given=item.get("given"),
                    given_values=list(item.get("given_values", [])),
                    expected=str(question.get("answer", "")),
                    expected_values=list(question.get("answer_values", [])),
                )
            )
        return TestResult(
            attempt_id=attempt.id,
            set_id=study_set.id,
            score=attempt.score or 0.0,
            correct_count=attempt.correct_count,
            total=len(attempt.questions),
            finished_at=attempt.finished_at or datetime.now(tz=UTC),
            review=review,
            wrong_card_ids=sorted(_wrong_card_ids(attempt)),
        )

    async def _record_reviews(
        self, user: User, attempt: TestAttempt, checked: list[dict[str, Any]]
    ) -> None:
        """Результат теста уходит в расписание тем же путём, что и тренировка."""
        from app.schemas.study import ReviewBatch, ReviewIn

        by_id = {str(question["id"]): question for question in attempt.questions}
        reviews: list[ReviewIn] = []
        moment = attempt.finished_at or datetime.now(tz=UTC)
        for item in checked:
            question = by_id.get(str(item["question_id"]))
            if question is None:
                continue
            for card_id in _question_card_ids(question):
                reviews.append(
                    ReviewIn(
                        # Детерминированный ключ: повторная отправка того же
                        # результата не создаёт вторую запись в журнале.
                        client_review_id=uuid5(
                            REVIEW_NAMESPACE, f"{attempt.id}:{item['question_id']}:{card_id}"
                        ),
                        card_id=card_id,
                        direction=StudyDirection(question["direction"]),
                        mode=StudyMode.test,
                        rating=3 if item["correct"] else 1,
                        answer_correct=bool(item["correct"]),
                        duration_ms=None,
                        reviewed_at=moment,
                    )
                )
        if reviews:
            await self.study.submit_reviews(user, ReviewBatch(session_id=None, reviews=reviews))

    async def _owned_attempt(self, user: User, attempt_id: UUID) -> TestAttempt:
        attempt = await self.db.get(TestAttempt, attempt_id)
        if attempt is None:
            raise NotFoundError("Попытка не найдена")
        if attempt.user_id != user.id:
            raise ForbiddenError("Нет доступа к этой попытке")
        return attempt


# --------------------------------------------------------------------- хелперы


def _pick_kind(
    kinds: list[TestQuestionKind], pool: list[str], rng: random.Random
) -> TestQuestionKind:
    """Выбирает тип вопроса, отбрасывая невозможные на этом наборе."""
    available = [
        kind
        for kind in kinds
        if kind not in (TestQuestionKind.choice, TestQuestionKind.true_false)
        or can_ask_multiple_choice(pool)
    ]
    return rng.choice(available or [TestQuestionKind.typing])


def _single_question(
    kind: TestQuestionKind,
    card: Card,
    direction: StudyDirection,
    study_set: StudySet,
    pool: list[str],
    rng: random.Random,
) -> dict[str, Any]:
    prompt = _question_side(card, direction)
    answer = _answer_side(card, direction)
    question: dict[str, Any] = {
        "id": f"{card.id}:{direction.value}:{kind.value}",
        "kind": kind.value,
        "card_id": str(card.id),
        "direction": direction.value,
        "prompt": prompt,
        "content_type": card.content_type.value,
        "code_language": card.code_language,
        "prompt_image_id": _question_image_id(card, direction),
        "hint": card.hint,
        "answer": answer,
        "alt_answers": list(card.alt_answers or []),
    }

    if kind is TestQuestionKind.choice:
        question["options"] = generate_options(answer, pool, rng=rng)
    elif kind is TestQuestionKind.true_false:
        # Половина утверждений верна, половина — с чужим ответом.
        truthful = rng.random() < 0.5
        decoys = [item for item in pool if item.strip() and item != answer]
        statement = answer if truthful or not decoys else rng.choice(decoys)
        question["statement"] = statement
        question["answer"] = "true" if statement == answer else "false"
        question["expected_text"] = answer
    return question


def _matching_question(
    bucket: list[tuple[Card, StudyDirection]], rng: random.Random
) -> dict[str, Any]:
    direction = bucket[0][1]
    lefts = [_question_side(card, card_direction) for card, card_direction in bucket]
    rights = [_answer_side(card, card_direction) for card, card_direction in bucket]
    shuffled = rights[:]
    rng.shuffle(shuffled)
    return {
        "id": "match:" + ":".join(str(card.id) for card, _ in bucket),
        "kind": TestQuestionKind.matching.value,
        "card_id": str(bucket[0][0].id),
        "card_ids": [str(card.id) for card, _ in bucket],
        "direction": direction.value,
        "prompt": "Сопоставьте пары",
        "content_type": "text",
        "pairs": lefts,
        "options": shuffled,
        "answer": " | ".join(rights),
        "answer_values": rights,
    }


def _check_question(
    question: dict[str, Any],
    *,
    value: str | None,
    values: list[str],
    strictness: Strictness,
    lang: str | None,
) -> dict[str, Any]:
    kind = TestQuestionKind(question["kind"])
    result: dict[str, Any] = {
        "question_id": question["id"],
        "given": value,
        "given_values": values,
    }

    if kind is TestQuestionKind.matching:
        expected = list(question.get("answer_values", []))
        correct = len(values) == len(expected) and all(
            check_answer(given, want, strictness=strictness, lang=lang).verdict
            is not AnswerVerdict.incorrect
            for given, want in zip(values, expected, strict=False)
        )
        result["correct"] = correct
        result["verdict"] = (
            AnswerVerdict.correct.value if correct else AnswerVerdict.incorrect.value
        )
        return result

    if value is None or not value.strip():
        result["correct"] = False
        result["verdict"] = AnswerVerdict.incorrect.value
        return result

    if kind is TestQuestionKind.true_false:
        correct = value.strip().lower() == str(question["answer"]).lower()
        result["correct"] = correct
        result["verdict"] = (
            AnswerVerdict.correct.value if correct else AnswerVerdict.incorrect.value
        )
        return result

    verdict = check_answer(
        value,
        str(question["answer"]),
        strictness=strictness,
        alternatives=list(question.get("alt_answers", [])),
        lang=lang,
    )
    # В тесте опечатку засчитываем: переспросить уже нельзя, а ошибкой она
    # по общему правилу не считается.
    result["correct"] = verdict.verdict is not AnswerVerdict.incorrect
    result["verdict"] = verdict.verdict.value
    return result


def _matches_source(source: TestSource, state: CardState | None) -> bool:
    if source is TestSource.new:
        return state is None or state.state is CardStateKind.new
    if source is TestSource.hard:
        if state is None:
            return False
        return state.lapses > 0 or (
            state.stability is not None and state.stability < MASTERED_STABILITY_DAYS
        )
    return True


def _wrong_card_ids(attempt: TestAttempt) -> set[UUID]:
    by_id = {str(question["id"]): question for question in attempt.questions}
    wrong: set[UUID] = set()
    for item in attempt.answers:
        if item.get("correct"):
            continue
        question = by_id.get(str(item["question_id"]))
        if question is not None:
            wrong.update(_question_card_ids(question))
    return wrong


def _question_card_ids(question: dict[str, Any]) -> list[UUID]:
    ids = question.get("card_ids") or [question["card_id"]]
    return [UUID(str(value)) for value in ids]


def _question_side(card: Card, direction: StudyDirection) -> str:
    return card.term if direction is StudyDirection.term_to_def else card.definition


def _answer_side(card: Card, direction: StudyDirection) -> str:
    return card.definition if direction is StudyDirection.term_to_def else card.term


def _question_image_id(card: Card, direction: StudyDirection) -> str | None:
    asset_id = (
        card.term_image_id
        if direction is StudyDirection.term_to_def
        else card.definition_image_id
    )
    return str(asset_id) if asset_id else None


def _answer_lang(study_set: StudySet, direction: StudyDirection) -> str:
    return (
        study_set.lang_definition
        if direction is StudyDirection.term_to_def
        else study_set.lang_term
    )
