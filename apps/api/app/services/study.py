"""Бизнес-логика обучения: очередь, приём ответов, сессии, статистика.

Источник истины по расписанию — сервер. Клиент получает пачку карточек вместе
с предвычисленными интервалами для всех четырёх оценок, отвечает локально и
присылает ответы батчами. Повторная отправка батча безопасна: ключ
идемпотентности — `client_review_id`, его генерирует клиент.
"""

from __future__ import annotations

import random
from collections import defaultdict
from datetime import UTC, datetime, timedelta
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.answers import Strictness
from app.core.config import get_settings
from app.core.errors import ConflictError, ForbiddenError, NotFoundError
from app.core.storage import get_object_storage
from app.models.content import Card, MediaAsset, MediaStatus, StudySet
from app.models.study import (
    CardState,
    CardStateKind,
    SessionStatus,
    StudyDirection,
    StudyMode,
    StudySession,
    UserSetProgress,
)
from app.models.user import User, UserSettings
from app.repositories import content as content_repo
from app.repositories import library as library_repo
from app.repositories import study as study_repo
from app.repositories import user as user_repo
from app.schemas.study import (
    CardStateOut,
    DirectionMode,
    ForecastDay,
    ProblemCard,
    QueueCard,
    QueueItem,
    QueueScope,
    RatingPreviewOut,
    ReviewBatch,
    ReviewBatchResult,
    SessionCreate,
    SetStats,
    StateDistribution,
    StudyQueue,
    StudySettingsUpdate,
)
from app.services.content import ContentService
from app.services.scheduler import SchedulerService, SchedulerState, initial_state

# Карточка считается выученной, когда стабильность перевалила за три недели:
# это тот порог, после которого FSRS сам ставит интервалы в месяцы.
MASTERED_STABILITY_DAYS = 21.0

# Сколько карточек отдаём в одну тренировку по умолчанию.
DEFAULT_QUEUE_LIMIT = 60
MAX_QUEUE_LIMIT = 200

FORECAST_DAYS = 14

# Карточка в очереди до превращения в ответ клиенту.
QueueEntry = tuple[Card, StudyDirection, SchedulerState]


class StudyService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.content = ContentService(db)

    # ---------------------------------------------------------------- настройки

    async def get_settings(self, user: User) -> UserSettings:
        return await user_repo.get_or_create_settings(self.db, user.id)

    async def update_settings(self, user: User, body: StudySettingsUpdate) -> UserSettings:
        settings = await user_repo.get_or_create_settings(self.db, user.id)
        for field, value in body.model_dump(exclude_unset=True).items():
            if value is not None:
                setattr(settings, field, value)
        await self.db.flush()
        return settings

    def _scheduler(self, settings: UserSettings) -> SchedulerService:
        return SchedulerService(
            desired_retention=settings.fsrs_desired_retention,
            maximum_interval_days=settings.fsrs_max_interval_days,
        )

    # ------------------------------------------------------------------ очередь

    async def get_queue(
        self,
        user: User,
        set_id: UUID,
        *,
        mode: StudyMode,
        scope: QueueScope,
        direction: DirectionMode,
        limit: int,
        shuffle: bool,
    ) -> StudyQueue:
        study_set = await self.content.get_study_set(user, set_id, with_cards=True)
        cards = await library_repo.accepted_cards(self.db, user.id, set_id, study_set.cards)
        settings = await user_repo.get_or_create_settings(self.db, user.id)
        scheduler = self._scheduler(settings)
        now = datetime.now(tz=UTC)
        limit = max(1, min(limit, MAX_QUEUE_LIMIT))
        directions = _directions(direction)

        states = {
            (state.card_id, state.direction): state
            for state in await study_repo.list_states_for_set(self.db, user.id, set_id)
        }
        day_start = _day_start(user, now)
        reviews_today = await study_repo.count_reviews_since(self.db, user.id, day_start)
        new_today = await study_repo.count_new_cards_since(self.db, user.id, day_start)
        reviews_left = max(0, settings.reviews_per_day - reviews_today)
        new_left = max(0, settings.new_cards_per_day - new_today)

        due: list[QueueEntry] = []
        fresh: list[QueueEntry] = []
        # Направление снаружи, карточки внутри: при `both` обратная сторона
        # оказывается на полный круг позже прямой, а не сразу за ней.
        for card_direction in directions:
            for card in cards:
                stored = states.get((card.id, card_direction))
                if stored is not None and stored.suspended_at is not None:
                    continue
                state = _to_scheduler_state(stored, now) if stored else initial_state(due_at=now)
                is_new = state.state is CardStateKind.new
                if not _matches_scope(scope, state, now):
                    continue
                (fresh if is_new else due).append((card, card_direction, state))

        due_total = len(due)
        new_total = len(fresh)
        if scope is QueueScope.due:
            # В «Заучивании» дневные лимиты обязательны, иначе очередь после
            # долгого перерыва превращается в несколько сотен карточек.
            due = due[:reviews_left]
            fresh = fresh[: max(0, min(new_left, limit - len(due)))]

        selected = _interleave(due, fresh, shuffle=shuffle)[:limit]
        asset_urls = await self._image_urls(study_set, [card for card, _, _ in selected])

        items = [
            QueueItem(
                card=_queue_card(card, asset_urls),
                direction=card_direction,
                state=_state_out(card.id, card_direction, state),
                previews=[
                    RatingPreviewOut(
                        rating=preview.rating,
                        due_at=preview.due_at,
                        interval_seconds=preview.interval_seconds,
                    )
                    for preview in scheduler.preview(state, now=now)
                ],
            )
            for card, card_direction, state in selected
        ]
        return StudyQueue(
            set_id=study_set.id,
            set_title=study_set.title,
            lang_term=study_set.lang_term,
            lang_definition=study_set.lang_definition,
            answer_strictness=Strictness(settings.answer_strictness),
            mode=mode,
            generated_at=now,
            scheduler_version=scheduler.version,
            items=items,
            due_total=due_total,
            new_total=new_total,
            new_left_today=new_left,
            reviews_left_today=reviews_left,
        )

    # -------------------------------------------------------------------- ответы

    async def submit_reviews(self, user: User, body: ReviewBatch) -> ReviewBatchResult:
        await study_repo.lock_learning(self.db, user.id)
        settings = await user_repo.get_or_create_settings(self.db, user.id)
        scheduler = self._scheduler(settings)
        session = await self._session_for_write(user, body.session_id)

        cards = await library_repo.cards_accessible_by(
            self.db, user.id, [item.card_id for item in body.reviews]
        )
        resets = await study_repo.reset_times(
            self.db, user.id, {card.set_id for card in cards.values()}
        )
        known = await study_repo.find_existing_client_review_ids(
            self.db, user.id, [item.client_review_id for item in body.reviews]
        )

        accepted: list[UUID] = []
        duplicates: list[UUID] = []
        rejected: list[UUID] = []
        touched: dict[tuple[UUID, StudyDirection], CardState] = {}

        # Порядок ответов задаёт расписание: интервал зависит от момента предыдущего
        # ответа, поэтому батч из офлайн-очереди разбираем по времени, а не по приходу.
        for item in sorted(body.reviews, key=lambda review: review.reviewed_at):
            card = cards.get(item.card_id)
            if card is None:
                rejected.append(item.client_review_id)
                continue
            if item.client_review_id in known:
                duplicates.append(item.client_review_id)
                continue
            reviewed_at = _to_utc(item.reviewed_at)
            reset_at = resets.get(card.set_id)
            if reset_at is not None and (
                reviewed_at <= reset_at
                or (
                    session is not None
                    and session.set_id == card.set_id
                    and session.started_at <= reset_at
                )
            ):
                rejected.append(item.client_review_id)
                continue
            state_row = touched.get((item.card_id, item.direction))
            if state_row is None:
                state_row = await self._get_or_create_state(user, card, item.direction, scheduler)
            before = _to_scheduler_state(state_row, reviewed_at)
            after = scheduler.review(before, item.rating, reviewed_at=reviewed_at)
            stored = await study_repo.insert_review(
                self.db,
                {
                    "user_id": user.id,
                    "card_id": card.id,
                    "set_id": card.set_id,
                    "direction": item.direction,
                    "session_id": session.id if session else None,
                    "client_review_id": item.client_review_id,
                    "mode": item.mode,
                    "rating": item.rating,
                    "answer_correct": item.answer_correct,
                    "duration_ms": item.duration_ms,
                    "reviewed_at": reviewed_at,
                    "state_before": before.as_json(),
                    "state_after": after.as_json(),
                    "scheduler_version": scheduler.version,
                },
            )
            if not stored:
                # Параллельный ретрай того же батча успел записать ответ первым.
                duplicates.append(item.client_review_id)
                continue
            _apply_state(state_row, after, scheduler.version)
            touched[(item.card_id, item.direction)] = state_row
            accepted.append(item.client_review_id)
            if session is not None:
                session.cards_seen += 1
                if item.answer_correct is True or (
                    item.answer_correct is None and item.rating >= 3
                ):
                    session.cards_correct += 1

        await self.db.flush()
        return ReviewBatchResult(
            accepted=accepted,
            duplicates=duplicates,
            rejected=rejected,
            states=[
                _state_out(state.card_id, state.direction, _to_scheduler_state(state, None))
                for state in touched.values()
            ],
        )

    async def _get_or_create_state(
        self, user: User, card: Card, direction: StudyDirection, scheduler: SchedulerService
    ) -> CardState:
        """Ленивая инициализация: строка появляется при первом ответе на карточку."""
        found = await study_repo.get_states(self.db, user.id, [(card.id, direction)])
        if found:
            return found[0]
        state = CardState(
            user_id=user.id,
            card_id=card.id,
            set_id=card.set_id,
            direction=direction,
            state=CardStateKind.new,
            due_at=datetime.now(tz=UTC),
            scheduler_version=scheduler.version,
        )
        self.db.add(state)
        await self.db.flush()
        return state

    # ------------------------------------------------------------------- сессии

    async def start_session(self, user: User, body: SessionCreate) -> StudySession:
        await study_repo.lock_learning(self.db, user.id)
        await self.content.get_study_set(user, body.set_id)
        existing = await study_repo.get_active_session(self.db, user.id, body.set_id, body.mode)
        if existing is not None:
            return existing
        session = StudySession(
            user_id=user.id, set_id=body.set_id, mode=body.mode, config=body.config
        )
        self.db.add(session)
        await self.db.flush()
        return session

    async def get_active_session(
        self, user: User, set_id: UUID, mode: StudyMode | None
    ) -> StudySession | None:
        await self.content.get_study_set(user, set_id)
        return await study_repo.get_active_session(self.db, user.id, set_id, mode)

    async def finish_session(self, user: User, session_id: UUID) -> StudySession:
        await study_repo.lock_learning(self.db, user.id)
        session = await self._owned_session(user, session_id)
        if session.status is SessionStatus.active:
            session.status = SessionStatus.finished
            session.ended_at = datetime.now(tz=UTC)
        await self.recalculate_progress(user, session.set_id)
        await self.db.flush()
        return session

    async def _session_for_write(self, user: User, session_id: UUID | None) -> StudySession | None:
        if session_id is None:
            return None
        session = await self._owned_session(user, session_id)
        if session.status is not SessionStatus.active and not session.config.get("progress_reset"):
            raise ConflictError("Сессия уже завершена")
        return session

    async def _owned_session(self, user: User, session_id: UUID) -> StudySession:
        session = await study_repo.get_session(self.db, session_id)
        if session is None:
            raise NotFoundError("Сессия не найдена")
        if session.user_id != user.id:
            raise ForbiddenError("Нет доступа к этой сессии")
        return session

    # --------------------------------------------------------------- статистика

    async def recalculate_progress(self, user: User, set_id: UUID) -> UserSetProgress:
        await study_repo.lock_learning(self.db, user.id)
        study_set = await self.content.get_study_set(user, set_id, with_cards=True)
        cards = await library_repo.accepted_cards(self.db, user.id, set_id, study_set.cards)
        states = await study_repo.list_states_for_set(self.db, user.id, set_id)
        per_card: dict[UUID, list[CardState]] = defaultdict(list)
        for state in states:
            per_card[state.card_id].append(state)

        mastered = learning = 0
        last_studied: datetime | None = None
        for card in cards:
            card_states = per_card.get(card.id, [])
            if not card_states:
                continue
            learning += 1
            if all(_is_mastered(state) for state in card_states):
                mastered += 1
                learning -= 1
            for state in card_states:
                if state.last_reviewed_at is not None and (
                    last_studied is None or state.last_reviewed_at > last_studied
                ):
                    last_studied = state.last_reviewed_at

        total = len(cards)
        progress = await study_repo.get_progress(self.db, user.id, set_id)
        if progress is None:
            progress = UserSetProgress(user_id=user.id, set_id=set_id)
            self.db.add(progress)
        progress.mastered_count = mastered
        progress.learning_count = learning
        progress.not_started_count = max(0, total - mastered - learning)
        progress.mastery_percent = round(mastered / total * 100, 1) if total else 0.0
        progress.last_studied_at = last_studied
        await self.db.flush()
        return progress

    async def get_set_stats(self, user: User, set_id: UUID) -> SetStats:
        await study_repo.lock_learning(self.db, user.id)
        study_set = await self.content.get_study_set(user, set_id, with_cards=True)
        accepted_cards = await library_repo.accepted_cards(
            self.db, user.id, set_id, study_set.cards
        )
        settings = await user_repo.get_or_create_settings(self.db, user.id)
        scheduler = self._scheduler(settings)
        now = datetime.now(tz=UTC)
        progress = await self.recalculate_progress(user, set_id)
        states = await study_repo.list_states_for_set(self.db, user.id, set_id)
        cards = {card.id: card for card in accepted_cards}

        distribution = StateDistribution()
        seen_cards: set[UUID] = set()
        due_now = 0
        problems: list[ProblemCard] = []
        for state in states:
            card = cards.get(state.card_id)
            if card is None:
                continue
            seen_cards.add(card.id)
            setattr(distribution, state.state.value, getattr(distribution, state.state.value) + 1)
            if state.suspended_at is None and state.due_at <= now:
                due_now += 1
            if state.lapses > 0:
                problems.append(
                    ProblemCard(
                        card_id=card.id,
                        term=card.term,
                        definition=card.definition,
                        lapses=state.lapses,
                        reps=state.reps,
                        retrievability=round(
                            scheduler.retrievability(_to_scheduler_state(state, now), now=now), 3
                        ),
                    )
                )
        distribution.new += len(cards) - len(seen_cards)
        problems.sort(key=lambda item: (-item.lapses, item.retrievability))

        return SetStats(
            set_id=set_id,
            cards_total=len(cards),
            mastered_count=progress.mastered_count,
            learning_count=progress.learning_count,
            not_started_count=progress.not_started_count,
            mastery_percent=progress.mastery_percent,
            due_now=due_now,
            last_studied_at=progress.last_studied_at,
            distribution=distribution,
            problem_cards=problems[:10],
            forecast=await self.get_forecast(user, days=FORECAST_DAYS, set_id=set_id),
        )

    async def reset_progress(self, user: User, set_id: UUID) -> None:
        await study_repo.lock_learning(self.db, user.id)
        await self.content.get_study_set(user, set_id)
        now = datetime.now(tz=UTC)
        await study_repo.reset_learning(self.db, user.id, set_id, now)
        progress = await self.recalculate_progress(user, set_id)
        progress.reset_at = now
        await self.db.flush()

    async def get_forecast(
        self, user: User, *, days: int = FORECAST_DAYS, set_id: UUID | None = None
    ) -> list[ForecastDay]:
        """Нагрузка на ближайшие дни. Просроченное сваливаем в сегодняшний день."""
        if set_id is not None:
            await self.content.get_study_set(user, set_id)
        now = datetime.now(tz=UTC)
        today = now.date()
        until = datetime.combine(today + timedelta(days=days), datetime.min.time(), tzinfo=UTC)
        counts: dict[str, int] = {
            (today + timedelta(days=offset)).isoformat(): 0 for offset in range(days)
        }
        for due_day, amount in await study_repo.forecast_due_counts(
            self.db, user.id, until, set_id
        ):
            bucket = max(due_day.date(), today).isoformat()
            if bucket in counts:
                counts[bucket] += amount
        return [ForecastDay(date=date, count=count) for date, count in sorted(counts.items())]

    # ----------------------------------------------------------------- картинки

    async def _image_urls(self, study_set: StudySet, cards: list[Card]) -> dict[UUID, str]:
        asset_ids = {
            asset_id
            for card in cards
            for asset_id in (card.term_image_id, card.definition_image_id)
            if asset_id is not None
        }
        if not asset_ids:
            return {}
        storage = get_object_storage()
        ttl = get_settings().media_download_ttl_seconds
        assets: list[MediaAsset] = await content_repo.get_media_assets(self.db, asset_ids)
        return {
            asset.id: storage.download_url(asset.s3_key, ttl)
            for asset in assets
            if asset.status == MediaStatus.ready and asset.owner_id == study_set.owner_id
        }


# --------------------------------------------------------------------- хелперы


def _directions(direction: DirectionMode) -> list[StudyDirection]:
    if direction is DirectionMode.both:
        return [StudyDirection.term_to_def, StudyDirection.def_to_term]
    return [StudyDirection(direction.value)]


def _matches_scope(scope: QueueScope, state: SchedulerState, now: datetime) -> bool:
    match scope:
        case QueueScope.due:
            return state.state is CardStateKind.new or state.due_at <= now
        case QueueScope.new:
            return state.state is CardStateKind.new
        case QueueScope.hard:
            return state.lapses > 0 or (
                state.stability is not None and state.stability < MASTERED_STABILITY_DAYS
            )
        case _:
            return True


def _interleave(
    due: list[QueueEntry],
    fresh: list[QueueEntry],
    *,
    shuffle: bool,
) -> list[QueueEntry]:
    """Размазывает новые карточки равномерно по просроченным.

    Если высыпать новые в конец, тренировка начинается как рутина и кончается
    стеной незнакомого материала. Поэтому новые встают в равноудалённые слоты.
    """
    if shuffle:
        due = random.sample(due, len(due))
        fresh = random.sample(fresh, len(fresh))
    if not fresh or not due:
        return _separate_neighbours(list(due) + list(fresh))

    total = len(due) + len(fresh)
    step = total / len(fresh)
    slots = {min(total - 1, int(step * index + step / 2)) for index in range(len(fresh))}
    due_iter, fresh_iter = iter(due), iter(fresh)
    merged: list[QueueEntry] = []
    for index in range(total):
        primary, fallback = (fresh_iter, due_iter) if index in slots else (due_iter, fresh_iter)
        item = next(primary, None) or next(fallback, None)
        if item is None:
            break
        merged.append(item)
    return _separate_neighbours(merged)


def _separate_neighbours(items: list[QueueEntry]) -> list[QueueEntry]:
    """Разводит две стороны одной карточки: рядом они работают как подсказка.

    Жадно берём ближайший элемент с другой карточкой. Когда одинаковых не
    избежать (в хвосте остались только они), ставим что есть — терять карточку
    из очереди ради красоты порядка нельзя.
    """
    remaining = list(items)
    ordered: list[QueueEntry] = []
    while remaining:
        index = next(
            (
                candidate
                for candidate, item in enumerate(remaining)
                if not ordered or item[0].id != ordered[-1][0].id
            ),
            0,
        )
        ordered.append(remaining.pop(index))
    return ordered


def _queue_card(card: Card, urls: dict[UUID, str]) -> QueueCard:
    return QueueCard(
        id=card.id,
        position=card.position,
        term=card.term,
        definition=card.definition,
        term_transcription=card.term_transcription,
        definition_transcription=card.definition_transcription,
        hint=card.hint,
        content_type=card.content_type,
        code_language=card.code_language,
        term_image_url=urls.get(card.term_image_id) if card.term_image_id else None,
        definition_image_url=(
            urls.get(card.definition_image_id) if card.definition_image_id else None
        ),
        alt_answers=list(card.alt_answers or []),
        wrong_term_answers=list(card.wrong_term_answers or []),
        wrong_definition_answers=list(card.wrong_definition_answers or []),
    )


def _state_out(card_id: UUID, direction: StudyDirection, state: SchedulerState) -> CardStateOut:
    return CardStateOut(
        card_id=card_id,
        direction=direction,
        state=state.state,
        stability=state.stability,
        difficulty=state.difficulty,
        due_at=state.due_at,
        last_reviewed_at=state.last_reviewed_at,
        reps=state.reps,
        lapses=state.lapses,
    )


def _to_scheduler_state(row: CardState, now: datetime | None) -> SchedulerState:
    return SchedulerState(
        due_at=_to_utc(row.due_at),
        state=row.state,
        stability=row.stability,
        difficulty=row.difficulty,
        step=row.step,
        last_reviewed_at=_to_utc(row.last_reviewed_at) if row.last_reviewed_at else None,
        reps=row.reps,
        lapses=row.lapses,
        elapsed_days=row.elapsed_days,
        scheduled_days=row.scheduled_days,
    )


def _apply_state(row: CardState, state: SchedulerState, version: str) -> None:
    row.state = state.state
    row.stability = state.stability
    row.difficulty = state.difficulty
    row.step = state.step
    row.due_at = state.due_at
    row.last_reviewed_at = state.last_reviewed_at
    row.reps = state.reps
    row.lapses = state.lapses
    row.elapsed_days = state.elapsed_days
    row.scheduled_days = state.scheduled_days
    row.scheduler_version = version


def _is_mastered(state: CardState) -> bool:
    return (
        state.state is CardStateKind.review
        and state.stability is not None
        and state.stability >= MASTERED_STABILITY_DAYS
    )


def _day_start(user: User, now: datetime) -> datetime:
    """Начало суток в таймзоне пользователя: дневные лимиты считаются по его дню."""
    try:
        zone = ZoneInfo(user.timezone)
    except (ZoneInfoNotFoundError, ValueError):
        zone = ZoneInfo("Europe/Moscow")
    local = now.astimezone(zone)
    return local.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(UTC)


def _to_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)
