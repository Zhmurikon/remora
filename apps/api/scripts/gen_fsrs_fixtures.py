"""Генератор золотых фикстур для сверки TS-порта FSRS с сервером.

Запуск:

    cd apps/api && uv run python scripts/gen_fsrs_fixtures.py

Фикстуры коммитятся. Их читают два теста: `tests/test_fsrs_fixtures.py`
проверяет, что сервер всё ещё считает так же, а `packages/core/src/fsrs.test.ts`
— что так же считает клиент. Любое расхождение ломает сборку с обеих сторон.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from app.services.scheduler import (
    SCHEDULER_VERSION,
    SchedulerService,
    SchedulerState,
    initial_state,
)

FIXTURE_PATH = (
    Path(__file__).resolve().parents[3] / "packages" / "core" / "src" / "fsrs-cases.json"
)

BASE = datetime(2026, 3, 1, 9, 0, tzinfo=UTC)

# Наборы настроек и последовательностей ответов, покрывающие все переходы:
# выход из шагов заучивания, рост интервала, провал выученной карточки,
# упор в максимальный интервал и ответ раньше срока.
SETTINGS: list[dict[str, float | int]] = [
    {"desired_retention": 0.90, "maximum_interval_days": 365},
    {"desired_retention": 0.80, "maximum_interval_days": 36500},
    {"desired_retention": 0.95, "maximum_interval_days": 30},
]

SEQUENCES: list[list[int]] = [
    [],
    [3],
    [3, 3],
    [3, 3, 3],
    [3, 3, 3, 3, 3],
    [1],
    [1, 1],
    [1, 3, 3],
    [2],
    [2, 2, 2],
    [4],
    [4, 4, 4],
    [3, 3, 1],
    [3, 3, 3, 1, 3],
    [4, 1, 2, 3],
]

# Задержка перед следующим ответом относительно срока: точно в срок,
# на день позже и сильно раньше срока.
DELAYS = [timedelta(0), timedelta(days=1), timedelta(hours=-6)]


def _state_json(state: SchedulerState) -> dict[str, Any]:
    return {
        "state": state.state.value,
        "stability": state.stability,
        "difficulty": state.difficulty,
        "step": state.step,
        "dueAt": state.due_at.isoformat(),
        "lastReviewedAt": (
            state.last_reviewed_at.isoformat() if state.last_reviewed_at else None
        ),
    }


def build_cases() -> dict[str, Any]:
    cases: list[dict[str, Any]] = []
    for settings in SETTINGS:
        scheduler = SchedulerService(
            desired_retention=float(settings["desired_retention"]),
            maximum_interval_days=int(settings["maximum_interval_days"]),
        )
        for sequence in SEQUENCES:
            for delay_index, delay in enumerate(DELAYS):
                state = initial_state(due_at=BASE)
                moment = BASE
                for rating in sequence:
                    state = scheduler.review(state, rating, reviewed_at=moment)
                    moment = state.due_at
                moment = moment + delay
                cases.append(
                    {
                        "name": (
                            f"r{settings['desired_retention']}"
                            f"-max{settings['maximum_interval_days']}"
                            f"-{''.join(str(item) for item in sequence) or 'new'}"
                            f"-d{delay_index}"
                        ),
                        "options": {
                            "desiredRetention": settings["desired_retention"],
                            "maximumIntervalDays": settings["maximum_interval_days"],
                        },
                        "now": moment.isoformat(),
                        "state": _state_json(state),
                        "previews": [
                            {
                                "rating": preview.rating,
                                "dueAt": preview.due_at.isoformat(),
                                "intervalSeconds": preview.interval_seconds,
                            }
                            for preview in scheduler.preview(state, now=moment)
                        ],
                        "after": [
                            {
                                "rating": rating,
                                "state": _state_json(
                                    scheduler.review(state, rating, reviewed_at=moment)
                                ),
                            }
                            for rating in (1, 2, 3, 4)
                        ],
                    }
                )
    return {"schedulerVersion": SCHEDULER_VERSION, "cases": cases}


def main() -> None:
    payload = build_cases()
    FIXTURE_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
    print(f"{len(payload['cases'])} кейсов записано в {FIXTURE_PATH}")


if __name__ == "__main__":
    main()
