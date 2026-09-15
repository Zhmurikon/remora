"""Режим «Тест»: генерация, проверка, пересдача и права доступа."""

from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest


async def _auth(client: pytest.fixture, suffix: str) -> dict[str, str]:
    email = f"test-mode-{suffix}@example.com"
    await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "Str0ngP@ss!", "username": f"testmode{suffix}"},
    )
    login = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": "Str0ngP@ss!"}
    )
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


async def _set_with_cards(
    client: pytest.fixture, headers: dict[str, str], count: int = 8
) -> dict[str, object]:
    created = await client.post(
        "/api/v1/sets",
        headers=headers,
        json={"title": "Английский", "lang_term": "ru", "lang_definition": "en"},
    )
    set_id = created.json()["id"]
    words = [
        ("кошка", "cat"),
        ("собака", "dog"),
        ("лошадь", "horse"),
        ("корова", "cow"),
        ("птица", "bird"),
        ("рыба", "fish"),
        ("мышь", "mouse"),
        ("лиса", "fox"),
        ("волк", "wolf"),
        ("медведь", "bear"),
    ]
    saved = await client.put(
        f"/api/v1/sets/{set_id}/cards",
        headers=headers,
        json={
            "cards": [
                {"term": term, "definition": definition} for term, definition in words[:count]
            ]
        },
    )
    return {"id": set_id, "cards": saved.json()["cards"]}


async def _create_test(
    client: pytest.fixture, headers: dict[str, str], set_id: str, **config: object
) -> dict[str, object]:
    payload: dict[str, object] = {"question_count": 5, "kinds": ["typing"]}
    payload.update(config)
    response = await client.post(
        f"/api/v1/study/sets/{set_id}/tests", headers=headers, json=payload
    )
    assert response.status_code == 201, response.text
    return response.json()


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_questions_do_not_leak_the_answer(
    _mock_send: AsyncMock, client: pytest.fixture
) -> None:
    """Правильный ответ не должен приезжать клиенту: иначе тест решается в devtools."""
    headers = await _auth(client, "leak")
    study_set = await _set_with_cards(client, headers)

    attempt = await _create_test(
        client, headers, str(study_set["id"]), kinds=["choice", "true_false", "typing"]
    )

    secret_keys = {"answer", "answer_values", "alt_answers", "expected_text"}
    for question in attempt["questions"]:
        assert secret_keys.isdisjoint(question), f"ответ утёк в вопросе {question['id']}"


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_attempt_is_fixed_between_requests(
    _mock_send: AsyncMock, client: pytest.fixture
) -> None:
    """Перезагрузка вкладки не должна менять вопросы посреди теста."""
    headers = await _auth(client, "fixed")
    study_set = await _set_with_cards(client, headers)
    attempt = await _create_test(client, headers, str(study_set["id"]))

    reloaded = await client.get(f"/api/v1/study/tests/{attempt['id']}", headers=headers)
    assert reloaded.status_code == 200
    assert [item["id"] for item in reloaded.json()["questions"]] == [
        item["id"] for item in attempt["questions"]
    ]


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_typing_answers_are_checked_by_the_shared_normalizer(
    _mock_send: AsyncMock, client: pytest.fixture
) -> None:
    headers = await _auth(client, "typing")
    study_set = await _set_with_cards(client, headers)
    cards = {card["id"]: card for card in study_set["cards"]}  # type: ignore[union-attr]
    attempt = await _create_test(client, headers, str(study_set["id"]), question_count=4)

    answers = []
    for index, question in enumerate(attempt["questions"]):
        card = cards[question["card_id"]]
        correct = card["definition"] if question["direction"] == "term_to_def" else card["term"]
        if index == 0:
            answers.append({"question_id": question["id"], "value": f"  {correct.upper()}  "})
        elif index == 1:
            answers.append({"question_id": question["id"], "value": "заведомо неверно"})
        else:
            answers.append({"question_id": question["id"], "value": correct})

    response = await client.post(
        f"/api/v1/study/tests/{attempt['id']}/submit",
        headers=headers,
        json={"answers": answers},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == len(attempt["questions"])
    assert body["correct_count"] == len(attempt["questions"]) - 1
    assert body["score"] == pytest.approx(
        round((len(attempt["questions"]) - 1) / len(attempt["questions"]) * 100, 1)
    )
    assert len(body["wrong_card_ids"]) == 1
    # Разбор показывает и ответ пользователя, и ожидаемый.
    wrong = next(item for item in body["review"] if not item["correct"])
    assert wrong["given"] == "заведомо неверно"
    assert wrong["expected"]


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_unanswered_questions_count_as_wrong(
    _mock_send: AsyncMock, client: pytest.fixture
) -> None:
    headers = await _auth(client, "skipped")
    study_set = await _set_with_cards(client, headers)
    attempt = await _create_test(client, headers, str(study_set["id"]), question_count=3)

    response = await client.post(
        f"/api/v1/study/tests/{attempt['id']}/submit", headers=headers, json={"answers": []}
    )
    assert response.json()["correct_count"] == 0
    assert response.json()["score"] == 0.0
    assert len(response.json()["review"]) == len(attempt["questions"])


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_repeated_submit_returns_the_same_result(
    _mock_send: AsyncMock, client: pytest.fixture
) -> None:
    """Повторная отправка не должна ни пересчитать балл, ни удвоить записи в журнале."""
    headers = await _auth(client, "resubmit")
    study_set = await _set_with_cards(client, headers)
    cards = {card["id"]: card for card in study_set["cards"]}  # type: ignore[union-attr]
    attempt = await _create_test(client, headers, str(study_set["id"]), question_count=3)
    answers = [
        {
            "question_id": question["id"],
            "value": cards[question["card_id"]]["definition"],
        }
        for question in attempt["questions"]
    ]

    first = await client.post(
        f"/api/v1/study/tests/{attempt['id']}/submit", headers=headers, json={"answers": answers}
    )
    second = await client.post(
        f"/api/v1/study/tests/{attempt['id']}/submit",
        headers=headers,
        json={"answers": [{"question_id": answers[0]["question_id"], "value": "мимо"}]},
    )

    assert first.json()["score"] == second.json()["score"]
    assert first.json()["finished_at"] == second.json()["finished_at"]

    stats = await client.get(
        f"/api/v1/study/sets/{study_set['id']}/stats", headers=headers
    )
    # Журнал не задвоился: состояния получили ровно по одному ответу.
    assert stats.json()["distribution"]["learning"] == 3


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_test_results_go_into_the_schedule(
    _mock_send: AsyncMock, client: pytest.fixture
) -> None:
    headers = await _auth(client, "schedule")
    study_set = await _set_with_cards(client, headers)
    cards = {card["id"]: card for card in study_set["cards"]}  # type: ignore[union-attr]
    attempt = await _create_test(client, headers, str(study_set["id"]), question_count=3)

    await client.post(
        f"/api/v1/study/tests/{attempt['id']}/submit",
        headers=headers,
        json={
            "answers": [
                {
                    "question_id": question["id"],
                    "value": cards[question["card_id"]]["definition"],
                }
                for question in attempt["questions"]
            ]
        },
    )

    stats = await client.get(f"/api/v1/study/sets/{study_set['id']}/stats", headers=headers)
    assert stats.json()["distribution"]["new"] == 5
    assert stats.json()["distribution"]["learning"] == 3


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_schedule_is_untouched_when_disabled(
    _mock_send: AsyncMock, client: pytest.fixture
) -> None:
    headers = await _auth(client, "noschedule")
    study_set = await _set_with_cards(client, headers)
    attempt = await _create_test(
        client, headers, str(study_set["id"]), question_count=3, write_to_schedule=False
    )

    await client.post(
        f"/api/v1/study/tests/{attempt['id']}/submit", headers=headers, json={"answers": []}
    )

    stats = await client.get(f"/api/v1/study/sets/{study_set['id']}/stats", headers=headers)
    assert stats.json()["distribution"]["new"] == 8
    assert stats.json()["distribution"]["learning"] == 0


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_retake_covers_only_the_mistakes(
    _mock_send: AsyncMock, client: pytest.fixture
) -> None:
    headers = await _auth(client, "retake")
    study_set = await _set_with_cards(client, headers)
    cards = {card["id"]: card for card in study_set["cards"]}  # type: ignore[union-attr]
    attempt = await _create_test(client, headers, str(study_set["id"]), question_count=4)

    result = await client.post(
        f"/api/v1/study/tests/{attempt['id']}/submit",
        headers=headers,
        json={
            "answers": [
                {
                    "question_id": question["id"],
                    "value": cards[question["card_id"]]["definition"] if index > 1 else "мимо",
                }
                for index, question in enumerate(attempt["questions"])
            ]
        },
    )
    wrong_ids = set(result.json()["wrong_card_ids"])
    assert len(wrong_ids) == 2

    retake = await client.post(
        f"/api/v1/study/tests/{attempt['id']}/retake", headers=headers
    )
    assert retake.status_code == 201
    assert retake.json()["retake_of_id"] == attempt["id"]
    assert {question["card_id"] for question in retake.json()["questions"]} == wrong_ids


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_retake_is_rejected_without_mistakes(
    _mock_send: AsyncMock, client: pytest.fixture
) -> None:
    headers = await _auth(client, "noretake")
    study_set = await _set_with_cards(client, headers)
    cards = {card["id"]: card for card in study_set["cards"]}  # type: ignore[union-attr]
    attempt = await _create_test(client, headers, str(study_set["id"]), question_count=2)

    await client.post(
        f"/api/v1/study/tests/{attempt['id']}/submit",
        headers=headers,
        json={
            "answers": [
                {
                    "question_id": question["id"],
                    "value": cards[question["card_id"]]["definition"],
                }
                for question in attempt["questions"]
            ]
        },
    )
    retake = await client.post(f"/api/v1/study/tests/{attempt['id']}/retake", headers=headers)
    assert retake.status_code == 409


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_matching_questions_are_generated_and_checked(
    _mock_send: AsyncMock, client: pytest.fixture
) -> None:
    headers = await _auth(client, "matching")
    study_set = await _set_with_cards(client, headers, count=10)
    attempt = await _create_test(
        client, headers, str(study_set["id"]), question_count=10, kinds=["matching"]
    )

    matching = [q for q in attempt["questions"] if q["kind"] == "matching"]
    assert matching, "ожидались вопросы на сопоставление"
    for question in matching:
        assert len(question["pairs"]) >= 2
        assert len(question["options"]) == len(question["pairs"])

    cards_by_term = {card["term"]: card for card in study_set["cards"]}  # type: ignore[union-attr]
    answers = [
        {
            "question_id": question["id"],
            "values": [cards_by_term[left]["definition"] for left in question["pairs"]],
        }
        for question in matching
    ]
    result = await client.post(
        f"/api/v1/study/tests/{attempt['id']}/submit", headers=headers, json={"answers": answers}
    )
    assert result.json()["correct_count"] == len(matching)


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_true_false_questions_carry_a_statement(
    _mock_send: AsyncMock, client: pytest.fixture
) -> None:
    headers = await _auth(client, "truefalse")
    study_set = await _set_with_cards(client, headers)
    attempt = await _create_test(
        client, headers, str(study_set["id"]), question_count=8, kinds=["true_false"]
    )

    for question in attempt["questions"]:
        assert question["kind"] == "true_false"
        assert question["statement"]
        assert question["prompt"]


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_empty_set_cannot_be_tested(
    _mock_send: AsyncMock, client: pytest.fixture
) -> None:
    headers = await _auth(client, "empty")
    created = await client.post("/api/v1/sets", headers=headers, json={"title": "Пустой"})
    response = await client.post(
        f"/api/v1/study/sets/{created.json()['id']}/tests",
        headers=headers,
        json={"question_count": 5},
    )
    assert response.status_code == 409
    assert response.json()["code"] == "CONFLICT"


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_attempts_are_isolated_between_users(
    _mock_send: AsyncMock, client: pytest.fixture
) -> None:
    """Обязательный тест прав доступа для нового ресурса."""
    owner = await _auth(client, "owner")
    stranger = await _auth(client, "stranger")
    study_set = await _set_with_cards(client, owner)
    attempt = await _create_test(client, owner, str(study_set["id"]))

    assert (
        await client.post(
            f"/api/v1/study/sets/{study_set['id']}/tests",
            headers=stranger,
            json={"question_count": 5},
        )
    ).status_code == 403
    assert (
        await client.get(f"/api/v1/study/tests/{attempt['id']}", headers=stranger)
    ).status_code == 403
    assert (
        await client.post(
            f"/api/v1/study/tests/{attempt['id']}/submit",
            headers=stranger,
            json={"answers": []},
        )
    ).status_code == 403
    assert (
        await client.post(f"/api/v1/study/tests/{attempt['id']}/retake", headers=stranger)
    ).status_code == 403
    assert (
        await client.get(f"/api/v1/study/tests/{attempt['id']}/result", headers=stranger)
    ).status_code == 403


async def test_test_endpoints_require_authentication(client: pytest.fixture) -> None:
    attempt_id = str(uuid4())
    assert (await client.get(f"/api/v1/study/tests/{attempt_id}")).status_code == 401
    assert (
        await client.post(f"/api/v1/study/sets/{uuid4()}/tests", json={"question_count": 5})
    ).status_code == 401
