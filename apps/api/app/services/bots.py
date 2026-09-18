import hashlib
import html
import random
import re
import secrets
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.core.answers import AnswerVerdict, Strictness, check_answer
from app.core.config import get_settings
from app.core.distractors import generate_options
from app.core.errors import ConflictError, NotFoundError
from app.models.bots import BotEvent, BotLink, BotLinkCode
from app.models.courses import Course, CourseArticle, CourseSection
from app.models.study import SessionStatus, StudyDirection, StudyMode, StudySession
from app.models.user import User, UserStatus
from app.repositories import bots as repo
from app.repositories import content as content_repo
from app.repositories import courses as course_repo
from app.schemas.bots import (
    BotCodeCreated,
    BotDelivery,
    BotDeliveryAck,
    BotEventIn,
    BotLinkPublic,
    BotPlatform,
)
from app.schemas.study import (
    DirectionMode,
    QueueItem,
    QueueScope,
    ReviewBatch,
    ReviewIn,
    SessionCreate,
)
from app.services.courses import CourseService
from app.services.study import StudyService
from app.services.tts import TtsService

CHOICE_LABELS = ("А", "Б", "В", "Г")


@dataclass(slots=True)
class BotReply:
    text: str
    keyboard: list[list[dict[str, str]]] = field(default_factory=list)
    audio_url: str | None = None


def _button(label: str, action: str) -> dict[str, str]:
    return {"label": label, "action": action}


def _plain_article(value: str) -> str:
    value = re.sub(r"<[^>]+>", " ", value)
    value = re.sub(r"[`*_>#~-]+", " ", value)
    return "\n".join(line.strip() for line in html.unescape(value).splitlines() if line.strip())


class BotService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_links(self, user: User) -> list[BotLinkPublic]:
        return [BotLinkPublic.model_validate(link) for link in await repo.links(self.db, user.id)]

    async def create_code(self, user: User, platform: BotPlatform) -> BotCodeCreated:
        await repo.lock(self.db, "bindings")
        await repo.lock(self.db, str(user.id))
        if any(link.platform == platform for link in await repo.links(self.db, user.id)):
            raise ConflictError("Сначала отключите существующую привязку")
        await repo.clear_codes(self.db, user.id, platform)
        code = secrets.token_urlsafe(24)
        expires = datetime.now(UTC) + timedelta(minutes=10)
        self.db.add(
            BotLinkCode(
                user_id=user.id,
                platform=platform,
                code_hash=hashlib.sha256(code.encode()).hexdigest(),
                expires_at=expires,
            )
        )
        settings = get_settings()
        url = (
            (
                f"https://t.me/{settings.tg_bot_username}?start={code}"
                if settings.tg_bot_username
                else None
            )
            if platform == BotPlatform.telegram
            else (
                f"https://vk.com/im?sel=-{settings.vk_group_id}" if settings.vk_group_id else None
            )
        )
        return BotCodeCreated(code=code, expires_at=expires, bot_url=url)

    async def revoke(self, user: User, link_id: UUID) -> None:
        await repo.lock(self.db, "bindings")
        await repo.lock(self.db, str(user.id))
        link = await self.db.get(BotLink, link_id)
        if link is None or link.user_id != user.id:
            raise NotFoundError()
        await repo.clear_codes(self.db, user.id, link.platform)
        await self.db.delete(link)

    async def enqueue(self, platform: BotPlatform, body: BotEventIn) -> None:
        await repo.enqueue(self.db, platform, body)

    async def reply(self, event: BotEvent) -> BotReply:
        await repo.lock(self.db, "bindings")
        settings_url = get_settings().app_url.rstrip("/") + "/settings"
        link = await repo.actor_link(self.db, event.platform, event.actor_id)
        if event.command == "link" and event.code_hash:
            code = await self.db.scalar(
                select(BotLinkCode).where(
                    BotLinkCode.code_hash == event.code_hash, BotLinkCode.platform == event.platform
                )
            )
            if code is None:
                return BotReply("Код недействителен. Получите новый код в настройках Remora.")
            await repo.lock(self.db, str(code.user_id))
            await self.db.refresh(code)
            user = await self.db.get(User, code.user_id)
            if (
                code.expires_at <= datetime.now(UTC)
                or user is None
                or user.deleted_at
                or user.status != UserStatus.active
            ):
                return BotReply("Код истёк или аккаунт недоступен. Получите новый код в Remora.")
            if link or any(
                item.platform == event.platform for item in await repo.links(self.db, user.id)
            ):
                return BotReply(
                    "Аккаунт уже привязан. Сначала отключите прежнюю привязку в настройках Remora."
                )
            self.db.add(BotLink(user_id=user.id, platform=event.platform, actor_id=event.actor_id))
            await self.db.delete(code)
            return BotReply(
                "Аккаунт Remora привязан. Можно открыть наборы или курсы.",
                [[_button("Учить карточки", "sets"), _button("Читать курсы", "courses")]],
            )
        if link:
            await repo.lock(self.db, str(link.user_id))
            # Отзыв в кабинете и команда бота должны видеть одно состояние.
            await self.db.refresh(link)
            user = await self.db.get(User, link.user_id)
            if user is None or user.deleted_at or user.status != UserStatus.active:
                return BotReply("Аккаунт Remora недоступен.")
            if event.command == "unlink":
                await repo.clear_codes(self.db, user.id, event.platform)
                await self.db.delete(link)
                return BotReply("Привязка отключена. Материалы и прогресс в Remora сохранены.")
            try:
                return await self._linked_reply(user, event)
            except (ValueError, KeyError):
                return BotReply(
                    "Эта кнопка устарела. Откройте раздел заново.",
                    [[_button("Наборы", "sets"), _button("Курсы", "courses")]],
                )
        return BotReply(
            "Сначала свяжите существующий аккаунт Remora. Откройте настройки, "
            "получите код для этого мессенджера и отправьте сюда: /link КОД\n" + settings_url
        )

    async def _linked_reply(self, user: User, event: BotEvent) -> BotReply:
        command = event.command
        if command in {"start", "status", "help", "home"}:
            return BotReply(
                "Remora подключена. Выберите, что хотите сделать.\n"
                "/sets — наборы · /courses — курсы · /continue — продолжить · /stop — закончить",
                [
                    [_button("Учить карточки", "sets"), _button("Читать курсы", "courses")],
                    [_button("Продолжить", "continue")],
                ],
            )
        if command == "sets":
            return await self._sets(user)
        if command.startswith("set:"):
            return await self._set(user, UUID(command[4:]))
        if command.startswith("mode:"):
            _, mode, set_id = command.split(":", 2)
            return await self._start(user, UUID(set_id), StudyMode(mode))
        if command == "continue":
            session = await self.db.scalar(
                select(StudySession)
                .where(StudySession.user_id == user.id, StudySession.status == SessionStatus.active)
                .order_by(StudySession.updated_at.desc())
            )
            return (
                await self._question(user, session)
                if session
                else BotReply("Нет незавершённой тренировки.")
            )
        if command == "stop":
            session = await self._active_bot_session(user)
            if session:
                await StudyService(self.db).finish_session(user, session.id)
            return BotReply(
                "Тренировка завершена. Прогресс сохранён.", [[_button("К наборам", "sets")]]
            )
        if command == "reveal":
            session = await self._active_bot_session(user)
            return await self._reveal(user, session)
        if command.startswith("rate:"):
            session = await self._active_bot_session(user)
            return await self._answer(user, session, int(command[5:]), None)
        if command.startswith("choice:"):
            session = await self._active_bot_session(user)
            return await self._choice(user, session, int(command[7:]))
        if command == "input":
            session = await self._active_bot_session(user)
            return await self._typed(user, session, event.input or "")
        if command == "courses":
            return await self._courses(user)
        if command.startswith("course:"):
            return await self._course(user, UUID(command[7:]))
        if command.startswith("article:"):
            return await self._article(user, UUID(command[8:]))
        return BotReply(
            "Не понял действие. Выберите раздел.",
            [[_button("Наборы", "sets"), _button("Курсы", "courses")]],
        )

    async def _sets(self, user: User) -> BotReply:
        sets = await content_repo.list_sets(self.db, user.id, limit=10)
        if not sets:
            return BotReply("У вас пока нет наборов. Создайте набор в кабинете Remora.")
        return BotReply(
            "Ваши наборы. Выберите один:",
            [[_button(item.title[:40], f"set:{item.id}")] for item in sets],
        )

    async def _set(self, user: User, set_id: UUID) -> BotReply:
        study_set = await StudyService(self.db).content.get_study_set(user, set_id)
        modes = [
            ("Карточки", "flashcards"),
            ("Заучивание", "learn"),
            ("Тест", "test"),
            ("Письмо", "write"),
            ("Аудирование", "listen"),
        ]
        return BotReply(
            f"{study_set.title}\nКарточек: {study_set.cards_count}. Выберите режим:",
            [[_button(label, f"mode:{mode}:{set_id}")] for label, mode in modes]
            + [[_button("Назад к наборам", "sets")]],
        )

    async def _start(self, user: User, set_id: UUID, mode: StudyMode) -> BotReply:
        study = StudyService(self.db)
        session = await study.start_session(
            user,
            SessionCreate(
                set_id=set_id, mode=mode, config={"scope": "due", "direction": "term_to_def"}
            ),
        )
        queue = await study.get_queue(
            user,
            set_id,
            mode=mode,
            scope=QueueScope.due if mode != StudyMode.flashcards else QueueScope.all,
            direction=DirectionMode.term_to_def,
            limit=60,
            shuffle=True,
        )
        session.config.update(
            bot_items=[item.model_dump(mode="json") for item in queue.items],
            bot_index=int(session.config.get("bot_index", 0)),
            bot_phase="question",
            bot_answer_strictness=queue.answer_strictness.value,
            bot_lang_term=queue.lang_term,
            bot_lang_definition=queue.lang_definition,
        )
        flag_modified(session, "config")
        return await self._question(user, session)

    async def _active_bot_session(self, user: User) -> StudySession | None:
        session: StudySession | None = await self.db.scalar(
            select(StudySession)
            .where(StudySession.user_id == user.id, StudySession.status == SessionStatus.active)
            .order_by(StudySession.updated_at.desc())
        )
        return session

    def _current(self, session: StudySession) -> QueueItem | None:
        items = session.config.get("bot_items", [])
        index = int(session.config.get("bot_index", 0))
        return QueueItem.model_validate(items[index]) if index < len(items) else None

    async def _question(self, user: User, session: StudySession | None) -> BotReply:
        if session is None:
            return BotReply("Нет активной тренировки.", [[_button("К наборам", "sets")]])
        if "bot_items" not in session.config:
            study = StudyService(self.db)
            queue = await study.get_queue(
                user,
                session.set_id,
                mode=session.mode,
                scope=QueueScope.all if session.mode == StudyMode.flashcards else QueueScope.due,
                direction=DirectionMode(str(session.config.get("direction", "term_to_def"))),
                limit=60,
                shuffle=True,
            )
            session.config.update(
                bot_items=[item.model_dump(mode="json") for item in queue.items],
                bot_index=0,
                bot_answer_strictness=queue.answer_strictness.value,
                bot_lang_term=queue.lang_term,
                bot_lang_definition=queue.lang_definition,
            )
            flag_modified(session, "config")
        current = self._current(session)
        if current is None:
            await StudyService(self.db).finish_session(user, session.id)
            return BotReply(
                "Очередь закончилась. Прогресс сохранён.", [[_button("К наборам", "sets")]]
            )
        question = (
            current.card.term
            if current.direction == StudyDirection.term_to_def
            else current.card.definition
        )
        answer = (
            current.card.definition
            if current.direction == StudyDirection.term_to_def
            else current.card.term
        )
        session.config["bot_phase"] = "question"
        session.config.pop("bot_options", None)
        flag_modified(session, "config")
        position = int(session.config.get("bot_index", 0)) + 1
        progress = f"{position}/{len(session.config.get('bot_items', []))}"
        if session.mode == StudyMode.flashcards:
            return BotReply(
                f"Карточки · {progress}\n\n{question}", [[_button("Показать ответ", "reveal")]]
            )
        if session.mode in {StudyMode.learn, StudyMode.test}:
            items = [QueueItem.model_validate(item) for item in session.config.get("bot_items", [])]
            pool = [
                i.card.definition
                if current.direction == StudyDirection.term_to_def
                else i.card.term
                for i in items
            ]
            preferred = (
                current.card.wrong_definition_answers
                if current.direction == StudyDirection.term_to_def
                else current.card.wrong_term_answers
            )
            options = generate_options(
                answer,
                pool,
                rng=random.Random(f"{session.id}:{session.config.get('bot_index', 0)}"),
                preferred=preferred,
                alternatives=current.card.alt_answers,
            )
            if len(options) >= 2:
                session.config["bot_options"] = options
                flag_modified(session, "config")
                title = "Тест" if session.mode == StudyMode.test else "Заучивание"
                rendered_options = "\n".join(
                    f"{CHOICE_LABELS[index]}. {option}" for index, option in enumerate(options)
                )
                return BotReply(
                    (
                        f"{title} · {progress}\n\n{question}\n\n"
                        f"{rendered_options}\n\nВыберите вариант:"
                    ),
                    [
                        [
                            _button(CHOICE_LABELS[index], f"choice:{index}")
                            for index in range(len(options))
                        ]
                    ],
                )
        prompt = "Напишите ответ сообщением."
        audio_url = None
        if session.mode == StudyMode.listen:
            lang = (
                session.config.get("bot_lang_term", "ru")
                if current.direction == StudyDirection.term_to_def
                else session.config.get("bot_lang_definition", "ru")
            )
            try:
                asset, _ = await TtsService(self.db).speak(user, question, lang=str(lang))
                audio_url = TtsService(self.db).download_url(asset)
                question = "Прослушайте запись"
            except Exception:  # noqa: BLE001 — режим остаётся доступен с понятной деградацией
                prompt = "Аудио сейчас недоступно. Напишите ответ на показанный вопрос."
        return BotReply(
            f"{session.mode.value} · {progress}\n\n{question}\n\n{prompt}", audio_url=audio_url
        )

    async def _reveal(self, user: User, session: StudySession | None) -> BotReply:
        if session is None or (current := self._current(session)) is None:
            return BotReply("Активная карточка не найдена.")
        answer = (
            current.card.definition
            if current.direction == StudyDirection.term_to_def
            else current.card.term
        )
        return BotReply(
            f"Ответ:\n\n{answer}\n\nНасколько хорошо вспомнили?",
            [
                [_button("1 · Снова", "rate:1"), _button("2 · Трудно", "rate:2")],
                [_button("3 · Хорошо", "rate:3"), _button("4 · Легко", "rate:4")],
            ],
        )

    async def _choice(self, user: User, session: StudySession | None, index: int) -> BotReply:
        if session is None or (current := self._current(session)) is None:
            return BotReply("Активный вопрос не найден.")
        options = session.config.get("bot_options", [])
        if index < 0 or index >= len(options):
            return BotReply("Этот вариант больше недоступен.")
        expected = (
            current.card.definition
            if current.direction == StudyDirection.term_to_def
            else current.card.term
        )
        correct = options[index] == expected
        return await self._answer(
            user, session, 3 if correct else 1, correct, chosen=options[index]
        )

    async def _typed(self, user: User, session: StudySession | None, typed: str) -> BotReply:
        if (
            session is None
            or (current := self._current(session)) is None
            or session.mode
            not in {StudyMode.write, StudyMode.listen, StudyMode.learn, StudyMode.test}
        ):
            return BotReply("Сейчас текстовый ответ не ожидается. Выберите действие кнопкой.")
        expected = (
            current.card.definition
            if current.direction == StudyDirection.term_to_def
            else current.card.term
        )
        lang = (
            session.config.get("bot_lang_definition", "ru")
            if current.direction == StudyDirection.term_to_def
            else session.config.get("bot_lang_term", "ru")
        )
        result = check_answer(
            typed,
            expected,
            strictness=Strictness(str(session.config.get("bot_answer_strictness", "moderate"))),
            alternatives=current.card.alt_answers,
            lang=str(lang),
        )
        if result.verdict == AnswerVerdict.typo:
            return BotReply("Похоже на опечатку. Попробуйте ввести ответ ещё раз.")
        return await self._answer(
            user,
            session,
            3 if result.verdict == AnswerVerdict.correct else 1,
            result.verdict == AnswerVerdict.correct,
            chosen=typed,
        )

    async def _answer(
        self,
        user: User,
        session: StudySession | None,
        rating: int,
        correct: bool | None,
        *,
        chosen: str | None = None,
    ) -> BotReply:
        if session is None or (current := self._current(session)) is None:
            return BotReply("Активный вопрос не найден.")
        await StudyService(self.db).submit_reviews(
            user,
            ReviewBatch(
                session_id=session.id,
                reviews=[
                    ReviewIn(
                        client_review_id=uuid4(),
                        card_id=current.card.id,
                        direction=current.direction,
                        mode=session.mode,
                        rating=rating,
                        answer_correct=correct,
                        reviewed_at=datetime.now(UTC),
                    )
                ],
            ),
        )
        expected = (
            current.card.definition
            if current.direction == StudyDirection.term_to_def
            else current.card.term
        )
        session.config["bot_index"] = int(session.config.get("bot_index", 0)) + 1
        flag_modified(session, "config")
        next_reply = await self._question(user, session)
        if correct is False:
            next_reply.text = (
                f"Неверно: {chosen or 'ответ не вспомнился'}\nПравильный ответ: {expected}\n\n"
                + next_reply.text
            )
        elif correct is True:
            next_reply.text = "Верно.\n\n" + next_reply.text
        return next_reply

    async def _courses(self, user: User) -> BotReply:
        courses = await course_repo.list_courses(self.db, user.id, limit=10)
        if not courses:
            return BotReply("У вас пока нет курсов.")
        return BotReply("Ваши курсы:", [[_button(c.title[:40], f"course:{c.id}")] for c in courses])

    async def _course(self, user: User, course_id: UUID) -> BotReply:
        course = await CourseService(self.db).detail(user, course_id)
        buttons = [
            [_button(article.title[:40], f"article:{article.id}")]
            for section in course.sections
            for article in section.articles
        ]
        return BotReply(
            f"{course.title}\n\n{course.description or 'Выберите статью.'}",
            [*buttons, [_button("К курсам", "courses")]],
        )

    async def _article(self, user: User, article_id: UUID) -> BotReply:
        article = await self.db.get(CourseArticle, article_id)
        if article is None:
            raise NotFoundError("Статья не найдена")
        section = await self.db.get(CourseSection, article.section_id)
        course = await self.db.get(Course, section.course_id) if section else None
        if course is None or course.owner_id != user.id:
            raise NotFoundError("Статья не найдена")
        body = _plain_article(article.body)
        if len(body) > 3500:
            body = body[:3497].rstrip() + "…"
        return BotReply(
            f"{article.title}\n\n{body or 'В статье пока нет текста.'}",
            [
                [
                    _button("Учить карточки статьи", f"set:{article.set_id}"),
                    _button("К курсу", f"course:{course.id}"),
                ]
            ],
        )

    async def claim(self, platform: BotPlatform) -> BotDelivery | None:
        now = datetime.now(UTC)
        event = await repo.next_event(self.db, platform, now)
        if event is None or event.available_at > now:
            return None
        if event.attempts >= 10:
            event.status = "failed"
            event.code_hash = None
            return None
        if event.reply is None:
            response = await self.reply(event)
            event.reply = response.text
            event.reply_keyboard = response.keyboard
            event.audio_url = response.audio_url
            event.code_hash = None
            event.input = None
        event.status = "sending"
        event.attempts += 1
        event.lease_token = uuid4()
        event.available_at = now + timedelta(seconds=60)
        return BotDelivery(
            id=event.id,
            lease_token=event.lease_token,
            actor_id=event.actor_id,
            text=event.reply,
            callback_id=event.callback_id,
            keyboard=event.reply_keyboard,
            audio_url=event.audio_url,
        )

    async def ack(self, platform: BotPlatform, event_id: UUID, body: BotDeliveryAck) -> None:
        event = await self.db.scalar(
            select(BotEvent)
            .where(BotEvent.id == event_id, BotEvent.platform == platform)
            .with_for_update()
        )
        if event is None:
            raise NotFoundError()
        if event.lease_token != body.lease_token:
            raise ConflictError("Доставка уже передана другому обработчику")
        if event.status == "sent":
            return
        if body.success:
            event.status = "sent"
            event.reply = None
            event.reply_keyboard = []
            event.audio_url = None
            event.callback_id = None
        else:
            event.available_at = datetime.now(UTC) + timedelta(seconds=min(60, 2**event.attempts))
