"""Печатные материалы: содержимое PDF, раскладки и права доступа."""

from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest

from app.services.printing import PrintCard, render_cards, render_terms, render_test


async def _auth(client: pytest.fixture, suffix: str) -> dict[str, str]:
    email = f"print-{suffix}@example.com"
    await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "Str0ngP@ss!", "username": f"print{suffix}"},
    )
    login = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": "Str0ngP@ss!"}
    )
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


async def _set_with_cards(
    client: pytest.fixture, headers: dict[str, str], count: int = 12
) -> str:
    created = await client.post("/api/v1/sets", headers=headers, json={"title": "Биология"})
    set_id = created.json()["id"]
    await client.put(
        f"/api/v1/sets/{set_id}/cards",
        headers=headers,
        json={
            "cards": [
                {"term": f"термин {index}", "definition": f"определение {index}"}
                for index in range(count)
            ]
        },
    )
    return str(set_id)


def _is_pdf(payload: bytes) -> bool:
    return payload.startswith(b"%PDF-") and payload.rstrip().endswith(b"%%EOF")


def test_cards_render_in_both_layouts() -> None:
    cards = [PrintCard(term=f"термин {i}", definition=f"определение {i}") for i in range(12)]

    double_sided = render_cards(title="Набор", cards=cards, layout="double_sided")
    foldable = render_cards(title="Набор", cards=cards, layout="foldable")

    assert _is_pdf(double_sided)
    assert _is_pdf(foldable)
    # Двусторонняя раскладка печатает лицо и оборот, поэтому она заметно длиннее.
    assert len(double_sided) > len(foldable)


def test_empty_set_still_produces_a_valid_document() -> None:
    assert _is_pdf(render_cards(title="Пустой", cards=[], layout="foldable"))
    assert _is_pdf(render_terms(title="Пустой", cards=[]))


def test_long_text_does_not_break_rendering() -> None:
    # Длинные определения переносятся по словам, а не обрезают документ.
    cards = [PrintCard(term="термин " * 20, definition="определение " * 40)] * 5
    assert _is_pdf(render_cards(title="Длинный", cards=cards, layout="foldable"))
    assert _is_pdf(render_terms(title="Длинный", cards=cards))


def test_test_and_answer_sheet_differ() -> None:
    questions = [
        {
            "kind": "choice",
            "prompt": "кошка",
            "options": ["cat", "dog", "bird", "fish"],
            "answer": "cat",
        },
        {"kind": "typing", "prompt": "собака", "answer": "dog"},
        {"kind": "true_false", "prompt": "лиса", "statement": "fox", "answer": "true"},
    ]
    blank = render_test(title="Английский", questions=questions, with_answers=False)
    key = render_test(title="Английский", questions=questions, with_answers=True)

    assert _is_pdf(blank)
    assert _is_pdf(key)
    # Ключ содержит те же вопросы плюс ответы, поэтому он объёмнее бланка.
    assert len(key) > len(blank)


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_print_endpoints_return_pdf(
    _mock_send: AsyncMock, client: pytest.fixture
) -> None:
    headers = await _auth(client, "endpoints")
    set_id = await _set_with_cards(client, headers)

    cards = await client.get(f"/api/v1/print/sets/{set_id}/cards", headers=headers)
    assert cards.status_code == 200
    assert cards.headers["content-type"] == "application/pdf"
    assert _is_pdf(cards.content)

    foldable = await client.get(
        f"/api/v1/print/sets/{set_id}/cards", headers=headers, params={"layout": "foldable"}
    )
    assert _is_pdf(foldable.content)

    terms = await client.get(f"/api/v1/print/sets/{set_id}/terms", headers=headers)
    assert _is_pdf(terms.content)


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_printed_test_matches_the_attempt(
    _mock_send: AsyncMock, client: pytest.fixture
) -> None:
    headers = await _auth(client, "test")
    set_id = await _set_with_cards(client, headers)
    attempt = await client.post(
        f"/api/v1/study/sets/{set_id}/tests",
        headers=headers,
        json={"question_count": 5, "kinds": ["choice", "typing"]},
    )
    attempt_id = attempt.json()["id"]

    blank = await client.get(f"/api/v1/print/tests/{attempt_id}", headers=headers)
    key = await client.get(
        f"/api/v1/print/tests/{attempt_id}", headers=headers, params={"answers": "true"}
    )

    assert _is_pdf(blank.content)
    assert _is_pdf(key.content)
    assert len(key.content) > len(blank.content)


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_printing_is_isolated_between_users(
    _mock_send: AsyncMock, client: pytest.fixture
) -> None:
    """Печать не должна стать обходным путём к чужому содержимому."""
    owner = await _auth(client, "owner")
    stranger = await _auth(client, "stranger")
    set_id = await _set_with_cards(client, owner, count=4)
    attempt = await client.post(
        f"/api/v1/study/sets/{set_id}/tests", headers=owner, json={"question_count": 3}
    )
    attempt_id = attempt.json()["id"]

    assert (
        await client.get(f"/api/v1/print/sets/{set_id}/cards", headers=stranger)
    ).status_code == 403
    assert (
        await client.get(f"/api/v1/print/sets/{set_id}/terms", headers=stranger)
    ).status_code == 403
    assert (
        await client.get(f"/api/v1/print/tests/{attempt_id}", headers=stranger)
    ).status_code == 403


async def test_print_endpoints_require_authentication(client: pytest.fixture) -> None:
    assert (await client.get(f"/api/v1/print/sets/{uuid4()}/cards")).status_code == 401
    assert (await client.get(f"/api/v1/print/tests/{uuid4()}")).status_code == 401
