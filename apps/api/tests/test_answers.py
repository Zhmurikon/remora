"""Нормализация ответов — обязательное покрытие (docs/02-functional-spec.md, раздел 7).

Тест читает тот же файл кейсов, что и `packages/core/src/answers.test.ts`.
Если реализации разойдутся, человек увидит «верно» в тренировке и ошибку
в результатах теста — поэтому контракт один на двоих.
"""

import json
from pathlib import Path

import pytest

from app.core.answers import (
    AnswerVerdict,
    Strictness,
    check_answer,
    levenshtein,
    normalize_answer,
    typo_threshold,
)

CASES_PATH = (
    Path(__file__).resolve().parents[3] / "packages" / "core" / "src" / "answer-cases.json"
)
CASES = json.loads(CASES_PATH.read_text())["cases"]


def test_contract_file_is_shared_with_the_frontend() -> None:
    assert CASES_PATH.exists()
    # Definition of Done этапа E4: не меньше 60 реальных кейсов.
    assert len(CASES) >= 60


@pytest.mark.parametrize("case", CASES, ids=[case["name"] for case in CASES])
def test_answer_contract(case: dict) -> None:
    result = check_answer(
        case["typed"],
        case["expected"],
        strictness=Strictness(case.get("strictness", "moderate")),
        alternatives=list(case.get("alternatives", [])),
        lang=case.get("lang"),
    )
    assert result.verdict == AnswerVerdict(str(case["verdict"]))
    if "matched" in case:
        assert result.matched == case["matched"]


def test_normalization_is_identical_across_strictness_for_case_and_yo() -> None:
    for strictness in Strictness:
        assert normalize_answer("  Ёлка\n\tЗелёная ", strictness=strictness) == "елка зеленая"


def test_strict_mode_keeps_punctuation_and_diacritics() -> None:
    assert (
        normalize_answer("café, s’il vous plaît", strictness=Strictness.strict)
        == "café, s’il vous plaît"
    )


def test_diacritics_are_stripped_only_from_latin() -> None:
    assert normalize_answer("café") == "cafe"
    assert normalize_answer("мой") == "мой"
    assert normalize_answer("тайный") == "тайный"


@pytest.mark.parametrize(
    ("left", "right", "expected"),
    [
        ("", "", 0),
        ("кошка", "кошка", 0),
        ("кошка", "кошки", 1),
        ("кот", "", 3),
        ("", "кот", 3),
        ("recieve", "receive", 2),
        ("abc", "cba", 2),
    ],
)
def test_levenshtein(left: str, right: str, expected: int) -> None:
    assert levenshtein(left, right) == expected
    assert levenshtein(right, left) == expected


def test_typo_threshold_grows_with_length() -> None:
    assert typo_threshold(3, Strictness.strict) == 0
    assert typo_threshold(50, Strictness.strict) == 0
    assert typo_threshold(3) == 0
    assert typo_threshold(7) == 1
    assert typo_threshold(20) == 2
    assert typo_threshold(20, Strictness.lenient) == 3
