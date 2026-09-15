"""Планировщик FSRS: переходы состояний, рост интервалов, детерминизм.

Обязательное покрытие из docs/02-functional-spec.md, раздел 7.
"""

from datetime import UTC, datetime, timedelta

import pytest

from app.models.study import CardStateKind
from app.services.scheduler import (
    MAX_DESIRED_RETENTION,
    MIN_DESIRED_RETENTION,
    SCHEDULER_VERSION,
    SchedulerService,
    initial_state,
)

NOW = datetime(2026, 3, 1, 9, 0, tzinfo=UTC)


def test_new_card_previews_cover_all_four_ratings() -> None:
    scheduler = SchedulerService()
    previews = scheduler.preview(initial_state(due_at=NOW), now=NOW)

    assert [preview.rating for preview in previews] == [1, 2, 3, 4]
    # Интервалы должны строго расти от «не помню» к «легко», иначе подписи
    # на кнопках самооценки вводят пользователя в заблуждение.
    intervals = [preview.interval_seconds for preview in previews]
    assert intervals == sorted(intervals)
    assert intervals[0] < intervals[-1]


def test_good_answers_grow_interval_and_promote_to_review() -> None:
    scheduler = SchedulerService()
    state = initial_state(due_at=NOW)
    moment = NOW
    scheduled: list[int] = []

    for _ in range(5):
        state = scheduler.review(state, 3, reviewed_at=moment)
        scheduled.append(state.scheduled_days)
        moment = state.due_at

    assert state.state is CardStateKind.review
    assert state.reps == 5
    assert state.lapses == 0
    # После выхода из шагов обучения интервалы растут монотонно.
    assert scheduled[2:] == sorted(scheduled[2:])
    assert scheduled[-1] > scheduled[2]


def test_again_on_review_card_returns_it_to_relearning() -> None:
    scheduler = SchedulerService()
    state = initial_state(due_at=NOW)
    moment = NOW
    for _ in range(4):
        state = scheduler.review(state, 3, reviewed_at=moment)
        moment = state.due_at

    long_interval = state.scheduled_days
    lapsed = scheduler.review(state, 1, reviewed_at=moment)

    assert lapsed.state is CardStateKind.relearning
    assert lapsed.lapses == 1
    assert lapsed.due_at - moment == timedelta(minutes=10)
    assert lapsed.scheduled_days < long_interval


def test_failing_a_new_card_is_not_counted_as_a_lapse() -> None:
    """Провал — это забытая выученная карточка, а не трудный старт заучивания."""
    scheduler = SchedulerService()
    state = initial_state(due_at=NOW)

    first_try = scheduler.review(state, 1, reviewed_at=NOW)
    assert first_try.lapses == 0

    second_try = scheduler.review(first_try, 1, reviewed_at=first_try.due_at)
    assert second_try.state is CardStateKind.learning
    assert second_try.lapses == 0


def test_maximum_interval_is_respected() -> None:
    scheduler = SchedulerService(maximum_interval_days=30)
    state = initial_state(due_at=NOW)
    moment = NOW
    for _ in range(12):
        state = scheduler.review(state, 4, reviewed_at=moment)
        moment = state.due_at
        assert state.scheduled_days <= 30


def test_desired_retention_shortens_intervals() -> None:
    relaxed = SchedulerService(desired_retention=0.80)
    strict = SchedulerService(desired_retention=0.95)
    state = initial_state(due_at=NOW)

    relaxed_state = relaxed.review(state, 4, reviewed_at=NOW)
    strict_state = strict.review(state, 4, reviewed_at=NOW)

    # Чем выше целевое удержание, тем чаще нужно повторять.
    assert strict_state.scheduled_days < relaxed_state.scheduled_days


def test_out_of_range_settings_are_clamped_not_rejected() -> None:
    # Настройки приходят из пользовательского ввода: сервис обязан их пережить.
    scheduler = SchedulerService(desired_retention=0.01, maximum_interval_days=10**9)
    assert scheduler.desired_retention == MIN_DESIRED_RETENTION
    assert scheduler.maximum_interval_days == 36500

    ceiling = SchedulerService(desired_retention=1.0)
    assert ceiling.desired_retention == MAX_DESIRED_RETENTION


def test_scheduling_is_deterministic() -> None:
    """Fuzzing выключен: клиентский предпросмотр обязан совпадать с сервером."""
    scheduler = SchedulerService()
    state = initial_state(due_at=NOW)
    moment = NOW
    for _ in range(3):
        state = scheduler.review(state, 3, reviewed_at=moment)
        moment = state.due_at

    repeated = [scheduler.review(state, 3, reviewed_at=moment).due_at for _ in range(5)]
    assert len(set(repeated)) == 1

    preview = next(item for item in scheduler.preview(state, now=moment) if item.rating == 3)
    assert preview.due_at == repeated[0]


def test_preview_matches_applied_review() -> None:
    scheduler = SchedulerService()
    state = initial_state(due_at=NOW)
    for rating in (1, 2, 3, 4):
        preview = next(
            item for item in scheduler.preview(state, now=NOW) if item.rating == rating
        )
        applied = scheduler.review(state, rating, reviewed_at=NOW)
        assert preview.due_at == applied.due_at


def test_unknown_rating_is_rejected() -> None:
    with pytest.raises(ValueError, match="оценка"):
        SchedulerService().review(initial_state(due_at=NOW), 5, reviewed_at=NOW)


def test_state_snapshot_is_json_serializable() -> None:
    state = SchedulerService().review(initial_state(due_at=NOW), 3, reviewed_at=NOW)
    snapshot = state.as_json()

    assert snapshot["state"] == "learning"
    assert snapshot["reps"] == 1
    assert isinstance(snapshot["due_at"], str)
    assert SCHEDULER_VERSION


def test_naive_datetime_is_treated_as_utc() -> None:
    scheduler = SchedulerService()
    aware = scheduler.review(initial_state(due_at=NOW), 3, reviewed_at=NOW)
    naive = scheduler.review(
        initial_state(due_at=NOW), 3, reviewed_at=NOW.replace(tzinfo=None)
    )
    assert aware.due_at == naive.due_at
