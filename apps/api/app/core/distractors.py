"""Подбор неверных вариантов ответа для теста.

Отдельно от TS-версии в `packages/core/src/distractors.ts` намеренно: там
варианты собираются на клиенте на лету в режиме «Заучивание», здесь —
фиксируются в `test_attempts` на сервере, потому что клиенту нельзя доверять
ни состав вопроса, ни правильный ответ. Совпадение реализаций не требуется:
у них разные входные данные и разное время жизни результата.

Близость считаем без ИИ — по длине, общему началу и общим словам. Этого хватает,
чтобы в вариантах оказались похожие термины, а не случайный шум из другой темы.
"""

from __future__ import annotations

import random

DEFAULT_OPTION_COUNT = 4


def similarity(left: str, right: str) -> float:
    """Грубая мера похожести: 0 — ничего общего, 1 — почти одно и то же."""
    first = _normalize(left)
    second = _normalize(right)
    if not first or not second:
        return 0.0

    length_score = 1 - abs(len(first) - len(second)) / max(len(first), len(second))

    prefix = 0
    for left_char, right_char in zip(first, second, strict=False):
        if left_char != right_char:
            break
        prefix += 1
    prefix_score = prefix / min(len(first), len(second))

    first_words = set(first.split(" "))
    second_words = second.split(" ")
    shared = sum(1 for word in second_words if word in first_words)
    word_score = shared / max(len(first_words), len(second_words))

    return length_score * 0.4 + prefix_score * 0.35 + word_score * 0.25


def generate_options(
    correct: str,
    pool: list[str],
    *,
    count: int = DEFAULT_OPTION_COUNT,
    rng: random.Random,
) -> list[str]:
    """Варианты ответа, включая правильный, в перемешанном порядке."""
    seen = {_normalize(correct)}
    candidates: list[str] = []
    for candidate in pool:
        key = _normalize(candidate)
        # Вариант, совпадающий с правильным ответом, сделал бы вопрос нерешаемым.
        if not key or key in seen:
            continue
        seen.add(key)
        candidates.append(candidate)

    ranked = sorted(
        candidates,
        key=lambda candidate: (-(similarity(correct, candidate) + rng.random() * 0.15)),
    )
    options = [correct, *ranked[: max(0, count - 1)]]
    rng.shuffle(options)
    return options


def can_ask_multiple_choice(pool: list[str], count: int = DEFAULT_OPTION_COUNT) -> bool:
    """Хватает ли в наборе уникальных ответов на вопрос с выбором."""
    return len({_normalize(item) for item in pool if _normalize(item)}) >= count - 1


def _normalize(value: str) -> str:
    return " ".join(value.strip().lower().replace("ё", "е").split())
