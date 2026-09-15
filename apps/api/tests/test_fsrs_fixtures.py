"""Сторож золотых фикстур FSRS.

Фикстуры в `packages/core/src/fsrs-cases.json` — контракт между серверным
планировщиком и его TS-портом. Этот тест ловит расхождение со стороны сервера:
изменились параметры, шаги или правила — фикстуры нужно перегенерировать
скриптом `scripts/gen_fsrs_fixtures.py` и осознанно закоммитить вместе с новой
версией `SCHEDULER_VERSION`. TS-сторона проверяется в `packages/core/src/fsrs.test.ts`.
"""

import json

from app.services.scheduler import SCHEDULER_VERSION
from scripts.gen_fsrs_fixtures import FIXTURE_PATH, build_cases


def test_committed_fixtures_match_current_scheduler() -> None:
    assert FIXTURE_PATH.exists(), "Фикстуры не сгенерированы"
    committed = json.loads(FIXTURE_PATH.read_text())
    current = build_cases()

    assert committed["schedulerVersion"] == SCHEDULER_VERSION
    assert len(committed["cases"]) == len(current["cases"])
    for expected, actual in zip(committed["cases"], current["cases"], strict=True):
        assert expected == actual, (
            f"Планировщик изменился на кейсе {actual['name']}. "
            "Перегенерируйте фикстуры и поднимите SCHEDULER_VERSION."
        )


def test_fixtures_cover_every_state_transition() -> None:
    cases = json.loads(FIXTURE_PATH.read_text())["cases"]
    states = {case["state"]["state"] for case in cases}
    after_states = {
        item["state"]["state"] for case in cases for item in case["after"]
    }

    assert states == {"new", "learning", "review", "relearning"}
    assert after_states == {"learning", "review", "relearning"}
