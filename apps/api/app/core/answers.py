"""Нормализация и сравнение ответов.

Зеркало `packages/core/src/answers.ts`. Клиент показывает вердикт мгновенно,
сервер пересчитывает его заново при проверке теста и не доверяет клиенту.
Расхождение реализаций означало бы, что человек видит «верно», а в результатах
теста получает ошибку, поэтому обе проверяются одним набором кейсов —
`packages/core/src/answer-cases.json`.

Порядок шагов нормализации и таблицы допусков обязаны совпадать с TS до символа.
"""

from __future__ import annotations

import enum
import re
import unicodedata
from dataclasses import dataclass


class Strictness(enum.StrEnum):
    strict = "strict"
    moderate = "moderate"
    lenient = "lenient"


class AnswerVerdict(enum.StrEnum):
    correct = "correct"
    typo = "typo"
    incorrect = "incorrect"


# Апострофы удаляются, остальная пунктуация заменяется пробелом:
# «don't» → «dont», но «кошка,собака» → «кошка собака».
_APOSTROPHES = re.compile(r"['’ʼ`´]")
_PUNCTUATION = re.compile(r"[.,;:!?«»„“”\"()\[\]{}<>/\\|—–\-_…*+=~^&%$#@]")
_WHITESPACE = re.compile(r"\s+")

# Диакритика снимается только с латиницы. В кириллице «й» — это «и» с кратким,
# и слепая свёртка приравняла бы «мой» к «мои». «ё» приводится к «е» отдельно:
# это привычная замена, а не потеря буквы, и работает во всех режимах.
_LATIN_DIACRITICS = re.compile(r"([a-z])[̀-ͯ]+")

# Артикли отбрасываются только в начале ответа и только для не-русских языков.
_ARTICLES: dict[str, frozenset[str]] = {
    "en": frozenset({"a", "an", "the"}),
    "de": frozenset(
        {"der", "die", "das", "den", "dem", "des", "ein", "eine", "einen", "einem", "einer"}
    ),
    "fr": frozenset({"le", "la", "les", "un", "une", "des", "l'", "du", "de"}),
    "es": frozenset({"el", "la", "los", "las", "un", "una", "unos", "unas"}),
    "it": frozenset({"il", "lo", "la", "i", "gli", "le", "un", "uno", "una"}),
}

# Допуск на опечатку по длине ожидаемого ответа: (максимальная длина, расстояние).
# Таблицами, а не формулой — значения должны совпадать с TS до единицы.
_TYPO_THRESHOLDS: dict[Strictness, tuple[tuple[float, int], ...]] = {
    Strictness.strict: ((float("inf"), 0),),
    Strictness.moderate: ((3, 0), (7, 1), (float("inf"), 2)),
    Strictness.lenient: ((2, 0), (5, 1), (10, 2), (float("inf"), 3)),
}


@dataclass(frozen=True, slots=True)
class AnswerResult:
    verdict: AnswerVerdict
    matched: str | None
    distance: float


def normalize_answer(
    value: str, *, strictness: Strictness = Strictness.moderate, lang: str | None = None
) -> str:
    result = value.strip().lower().replace("ё", "е")

    if strictness is not Strictness.strict:
        decomposed = unicodedata.normalize("NFD", result)
        result = unicodedata.normalize("NFC", _LATIN_DIACRITICS.sub(r"\1", decomposed))
        result = _APOSTROPHES.sub("", result)
        result = _PUNCTUATION.sub(" ", result)

    result = _WHITESPACE.sub(" ", result).strip()

    if strictness is not Strictness.strict:
        result = _strip_article(result, lang)
    return result


def check_answer(
    typed: str,
    expected: str,
    *,
    strictness: Strictness = Strictness.moderate,
    alternatives: list[str] | None = None,
    lang: str | None = None,
) -> AnswerResult:
    candidates = [expected, *(alternatives or [])]
    normalized_typed = normalize_answer(typed, strictness=strictness, lang=lang)
    if not normalized_typed:
        return AnswerResult(AnswerVerdict.incorrect, None, float("inf"))

    best = AnswerResult(AnswerVerdict.incorrect, None, float("inf"))
    for candidate in candidates:
        normalized = normalize_answer(candidate, strictness=strictness, lang=lang)
        if not normalized:
            continue
        if normalized == normalized_typed:
            return AnswerResult(AnswerVerdict.correct, candidate, 0)
        distance = levenshtein(normalized_typed, normalized)
        if distance < best.distance:
            verdict = (
                AnswerVerdict.typo
                if distance <= typo_threshold(len(normalized), strictness)
                else AnswerVerdict.incorrect
            )
            best = AnswerResult(verdict, candidate, distance)
    return best


def typo_threshold(length: int, strictness: Strictness = Strictness.moderate) -> int:
    """Расстояние, при котором ответ ещё считается опечаткой, а не ошибкой."""
    for max_length, threshold in _TYPO_THRESHOLDS[strictness]:
        if length <= max_length:
            return threshold
    return 0


def levenshtein(left: str, right: str) -> int:
    if left == right:
        return 0
    if not left:
        return len(right)
    if not right:
        return len(left)

    previous = list(range(len(right) + 1))
    for i, left_char in enumerate(left, start=1):
        current = [i]
        for j, right_char in enumerate(right, start=1):
            substitution = previous[j - 1] + (0 if left_char == right_char else 1)
            current.append(min(current[j - 1] + 1, previous[j] + 1, substitution))
        previous = current
    return previous[len(right)]


def _strip_article(value: str, lang: str | None) -> str:
    articles = _ARTICLES.get((lang or "ru")[:2].lower())
    if not articles:
        return value
    head, separator, rest = value.partition(" ")
    # Односложный ответ не трогаем: «the» как ответ на «определённый артикль»
    # должен остаться собой.
    if not separator:
        return value
    return rest if head in articles else value
