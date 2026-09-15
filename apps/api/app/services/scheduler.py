"""Планировщик повторений поверх `py-fsrs`.

Три решения, которые здесь зафиксированы намеренно.

1. **Параметры модели скопированы в код, а не берутся из библиотеки.** Обновление
   `fsrs` не должно молча переписать расписание всем пользователям. Если
   параметры меняются — меняется `SCHEDULER_VERSION`, и старые записи в журнале
   остаются интерпретируемыми.
2. **Fuzzing выключен.** Библиотека по умолчанию размазывает интервалы случайным
   образом. Тогда клиентский предпросмотр («через 3 дня») расходился бы с тем,
   что реально записал сервер. Ради честной подписи на кнопке отказываемся от
   размазывания нагрузки — на наших объёмах это несущественно.
3. **`new` — наше состояние, а не FSRS.** В библиотеке карточка сразу Learning;
   нам нужно отличать «ещё ни разу не показывали» для дневного лимита новых.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from fsrs import Card as FsrsCard
from fsrs import Rating as FsrsRating
from fsrs import Scheduler as FsrsScheduler
from fsrs import State as FsrsState

from app.models.study import CardStateKind

# Версия связки «параметры + шаги + правила». Пишется в card_states и reviews,
# чтобы переоптимизация параметров в будущем не сломала интерпретацию истории.
SCHEDULER_VERSION = "fsrs6-v1"

# FSRS-6, параметры по умолчанию из py-fsrs 6.3. Скопированы осознанно, см. шапку.
FSRS_PARAMETERS: tuple[float, ...] = (
    0.212,
    1.2931,
    2.3065,
    8.2956,
    6.4133,
    0.8334,
    3.0194,
    0.001,
    1.8722,
    0.1666,
    0.796,
    1.4835,
    0.0614,
    0.2629,
    1.6483,
    0.6014,
    1.8729,
    0.5425,
    0.0912,
    0.0658,
    0.1542,
)

LEARNING_STEPS: tuple[timedelta, ...] = (timedelta(minutes=1), timedelta(minutes=10))
RELEARNING_STEPS: tuple[timedelta, ...] = (timedelta(minutes=10),)

RATINGS: tuple[int, ...] = (1, 2, 3, 4)

MIN_DESIRED_RETENTION = 0.70
MAX_DESIRED_RETENTION = 0.98
MIN_MAX_INTERVAL_DAYS = 1
MAX_MAX_INTERVAL_DAYS = 36500


@dataclass(frozen=True, slots=True)
class SchedulerState:
    """Состояние карточки в терминах планировщика, без привязки к ORM."""

    due_at: datetime
    state: CardStateKind = CardStateKind.new
    stability: float | None = None
    difficulty: float | None = None
    step: int | None = 0
    last_reviewed_at: datetime | None = None
    reps: int = 0
    lapses: int = 0
    elapsed_days: int = 0
    scheduled_days: int = 0

    def as_json(self) -> dict[str, object]:
        """Снимок для журнала ответов (`state_before` / `state_after`)."""
        return {
            "state": self.state.value,
            "stability": self.stability,
            "difficulty": self.difficulty,
            "step": self.step,
            "due_at": self.due_at.isoformat(),
            "last_reviewed_at": (
                self.last_reviewed_at.isoformat() if self.last_reviewed_at else None
            ),
            "reps": self.reps,
            "lapses": self.lapses,
        }


@dataclass(frozen=True, slots=True)
class RatingPreview:
    """Что произойдёт с карточкой при конкретной оценке."""

    rating: int
    due_at: datetime
    interval_seconds: int


class SchedulerService:
    """Единственное место, где вызывается FSRS."""

    version = SCHEDULER_VERSION

    def __init__(self, *, desired_retention: float = 0.9, maximum_interval_days: int = 365) -> None:
        self.desired_retention = _clamp(
            desired_retention, MIN_DESIRED_RETENTION, MAX_DESIRED_RETENTION
        )
        self.maximum_interval_days = int(
            _clamp(maximum_interval_days, MIN_MAX_INTERVAL_DAYS, MAX_MAX_INTERVAL_DAYS)
        )
        self._scheduler = FsrsScheduler(
            parameters=FSRS_PARAMETERS,
            desired_retention=self.desired_retention,
            learning_steps=LEARNING_STEPS,
            relearning_steps=RELEARNING_STEPS,
            maximum_interval=self.maximum_interval_days,
            enable_fuzzing=False,
        )

    def review(
        self, state: SchedulerState, rating: int, *, reviewed_at: datetime
    ) -> SchedulerState:
        """Применяет ответ и возвращает новое состояние карточки."""
        if rating not in RATINGS:
            raise ValueError(f"Недопустимая оценка: {rating}")
        moment = _to_utc(reviewed_at)
        reviewed, _ = self._scheduler.review_card(
            self._to_fsrs(state, moment), FsrsRating(rating), review_datetime=moment
        )
        due_at = reviewed.due if reviewed.due is not None else moment
        elapsed_days = (
            max(0, (moment - state.last_reviewed_at).days)
            if state.last_reviewed_at is not None
            else 0
        )
        # Провалом считаем только забытую выученную карточку. «Не помню» на новой
        # или на карточке в процессе заучивания — это норма процесса, и если
        # писать её в lapses, список проблемных карточек забьётся новичками.
        lapsed = rating == FsrsRating.Again and state.state is CardStateKind.review
        return SchedulerState(
            due_at=due_at,
            state=_from_fsrs_state(reviewed.state),
            stability=reviewed.stability,
            difficulty=reviewed.difficulty,
            step=reviewed.step,
            last_reviewed_at=moment,
            reps=state.reps + 1,
            lapses=state.lapses + (1 if lapsed else 0),
            elapsed_days=elapsed_days,
            scheduled_days=max(0, (due_at - moment).days),
        )

    def preview(self, state: SchedulerState, *, now: datetime) -> list[RatingPreview]:
        """Интервалы для всех четырёх оценок — подписи на кнопках самооценки."""
        moment = _to_utc(now)
        previews = []
        for rating in RATINGS:
            after = self.review(state, rating, reviewed_at=moment)
            previews.append(
                RatingPreview(
                    rating=rating,
                    due_at=after.due_at,
                    interval_seconds=max(0, int((after.due_at - moment).total_seconds())),
                )
            )
        return previews

    def retrievability(self, state: SchedulerState, *, now: datetime) -> float:
        """Вероятность вспомнить карточку сейчас. Нужна для статистики набора."""
        if state.stability is None or state.last_reviewed_at is None:
            return 0.0
        return self._scheduler.get_card_retrievability(
            self._to_fsrs(state, _to_utc(now)), current_datetime=_to_utc(now)
        )

    def _to_fsrs(self, state: SchedulerState, moment: datetime) -> FsrsCard:
        if state.state is CardStateKind.new:
            # Новая карточка: у FSRS нет отдельного состояния, стартуем с нулевого шага
            # обучения без накопленных стабильности и сложности.
            return FsrsCard(card_id=1, state=FsrsState.Learning, step=0, due=moment)
        return FsrsCard(
            card_id=1,
            state=_to_fsrs_state(state.state),
            step=state.step if state.state is not CardStateKind.review else None,
            stability=state.stability,
            difficulty=state.difficulty,
            due=_to_utc(state.due_at),
            last_review=_to_utc(state.last_reviewed_at) if state.last_reviewed_at else None,
        )


def initial_state(*, due_at: datetime) -> SchedulerState:
    """Состояние только что созданной (ещё не показанной) карточки."""
    return SchedulerState(due_at=_to_utc(due_at))


def _to_fsrs_state(state: CardStateKind) -> FsrsState:
    match state:
        case CardStateKind.review:
            return FsrsState.Review
        case CardStateKind.relearning:
            return FsrsState.Relearning
        case _:
            return FsrsState.Learning


def _from_fsrs_state(state: FsrsState) -> CardStateKind:
    match state:
        case FsrsState.Review:
            return CardStateKind.review
        case FsrsState.Relearning:
            return CardStateKind.relearning
        case _:
            return CardStateKind.learning


def _to_utc(value: datetime) -> datetime:
    """FSRS требует tz-aware UTC и падает на любом другом смещении."""
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _clamp(value: float, low: float, high: float) -> float:
    return min(max(value, low), high)
