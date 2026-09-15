"""Очередь, приём ответов и права доступа в движке обучения."""

from datetime import UTC, datetime, timedelta
from itertools import pairwise
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest


async def _auth(client: pytest.fixture, suffix: str) -> dict[str, str]:
    email = f"study-{suffix}@example.com"
    await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "Str0ngP@ss!", "username": f"study{suffix}"},
    )
    login = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": "Str0ngP@ss!"}
    )
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


async def _set_with_cards(
    client: pytest.fixture, headers: dict[str, str], count: int = 4
) -> dict[str, object]:
    created = await client.post("/api/v1/sets", headers=headers, json={"title": "Биология"})
    set_id = created.json()["id"]
    saved = await client.put(
        f"/api/v1/sets/{set_id}/cards",
        headers=headers,
        json={
            "cards": [
                {"term": f"термин {index}", "definition": f"определение {index}"}
                for index in range(count)
            ]
        },
    )
    return {"id": set_id, "cards": saved.json()["cards"]}


def _review(card_id: str, rating: int = 3, **overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "client_review_id": str(uuid4()),
        "card_id": card_id,
        "direction": "term_to_def",
        "mode": "learn",
        "rating": rating,
        "answer_correct": rating >= 3,
        "duration_ms": 1500,
        "reviewed_at": datetime.now(tz=UTC).isoformat(),
    }
    payload.update(overrides)
    return payload


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_queue_returns_new_cards_with_interval_previews(
    _mock_send: AsyncMock, client: pytest.fixture
) -> None:
    headers = await _auth(client, "queue")
    study_set = await _set_with_cards(client, headers)

    response = await client.get(
        f"/api/v1/study/sets/{study_set['id']}/queue", headers=headers
    )
    assert response.status_code == 200
    body = response.json()
    assert body["new_total"] == 4
    assert body["due_total"] == 0
    assert len(body["items"]) == 4
    item = body["items"][0]
    assert item["state"]["state"] == "new"
    assert [preview["rating"] for preview in item["previews"]] == [1, 2, 3, 4]
    assert item["previews"][0]["interval_seconds"] < item["previews"][3]["interval_seconds"]


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_queue_both_directions_gives_two_items_per_card(
    _mock_send: AsyncMock, client: pytest.fixture
) -> None:
    headers = await _auth(client, "directions")
    study_set = await _set_with_cards(client, headers, count=3)

    response = await client.get(
        f"/api/v1/study/sets/{study_set['id']}/queue",
        headers=headers,
        params={"direction": "both", "shuffle": "false"},
    )
    body = response.json()
    assert len(body["items"]) == 6
    directions = {item["direction"] for item in body["items"]}
    assert directions == {"term_to_def", "def_to_term"}
    # Две стороны одной карточки подряд — это подсказка, их разводят.
    card_ids = [item["card"]["id"] for item in body["items"]]
    assert all(left != right for left, right in pairwise(card_ids))


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_reviews_create_state_and_schedule_next_repetition(
    _mock_send: AsyncMock, client: pytest.fixture
) -> None:
    headers = await _auth(client, "reviews")
    study_set = await _set_with_cards(client, headers)
    cards = study_set["cards"]
    session = await client.post(
        "/api/v1/study/sessions",
        headers=headers,
        json={"set_id": study_set["id"], "mode": "learn"},
    )
    assert session.status_code == 201
    session_id = session.json()["id"]

    response = await client.post(
        "/api/v1/study/reviews",
        headers=headers,
        json={
            "session_id": session_id,
            "reviews": [_review(cards[0]["id"]), _review(cards[1]["id"], rating=1)],
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert len(body["accepted"]) == 2
    assert body["duplicates"] == []
    assert body["rejected"] == []
    states = {state["card_id"]: state for state in body["states"]}
    assert states[cards[0]["id"]]["state"] == "learning"
    assert states[cards[0]["id"]]["reps"] == 1
    assert states[cards[1]["id"]]["lapses"] == 0  # первый ответ «не помню» — ещё не lapse

    finished = await client.post(
        f"/api/v1/study/sessions/{session_id}/finish", headers=headers
    )
    assert finished.status_code == 200
    assert finished.json()["status"] == "finished"
    assert finished.json()["cards_seen"] == 2
    assert finished.json()["cards_correct"] == 1


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_repeated_batch_is_idempotent(
    _mock_send: AsyncMock, client: pytest.fixture
) -> None:
    """Ретрай после обрыва сети не должен ни потерять ответ, ни удвоить его."""
    headers = await _auth(client, "idempotent")
    study_set = await _set_with_cards(client, headers)
    card_id = study_set["cards"][0]["id"]
    batch = {"reviews": [_review(card_id)]}

    first = await client.post("/api/v1/study/reviews", headers=headers, json=batch)
    second = await client.post("/api/v1/study/reviews", headers=headers, json=batch)

    assert len(first.json()["accepted"]) == 1
    assert second.json()["accepted"] == []
    assert second.json()["duplicates"] == [batch["reviews"][0]["client_review_id"]]

    stats = await client.get(f"/api/v1/study/sets/{study_set['id']}/stats", headers=headers)
    assert stats.json()["distribution"]["learning"] == 1
    assert stats.json()["distribution"]["new"] == 3


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_answers_are_applied_in_chronological_order(
    _mock_send: AsyncMock, client: pytest.fixture
) -> None:
    """Офлайн-очередь приходит одним батчем — порядок задаёт reviewed_at, не приход."""
    headers = await _auth(client, "order")
    study_set = await _set_with_cards(client, headers)
    card_id = study_set["cards"][0]["id"]
    start = datetime.now(tz=UTC) - timedelta(hours=2)

    response = await client.post(
        "/api/v1/study/reviews",
        headers=headers,
        json={
            "reviews": [
                _review(card_id, reviewed_at=(start + timedelta(minutes=30)).isoformat()),
                _review(card_id, reviewed_at=start.isoformat()),
            ]
        },
    )
    assert len(response.json()["accepted"]) == 2
    state = response.json()["states"][0]
    assert state["reps"] == 2
    assert state["state"] in {"learning", "review"}


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_card_is_learned_over_several_sessions(
    _mock_send: AsyncMock, client: pytest.fixture
) -> None:
    """Сценарий из Definition of Done этапа E3.

    Карточка проходится за несколько сессий: интервалы растут, ошибка
    возвращает карточку к немедленному повторению.
    """
    headers = await _auth(client, "journey")
    study_set = await _set_with_cards(client, headers, count=3)
    card_id = study_set["cards"][0]["id"]

    # Отвечаем ровно в срок, как это делал бы человек: каждая следующая сессия
    # начинается тогда, когда карточка снова стала просроченной.
    moment = datetime.now(tz=UTC) - timedelta(days=60)
    intervals: list[float] = []
    for _ in range(4):
        response = await client.post(
            "/api/v1/study/reviews",
            headers=headers,
            json={"reviews": [_review(card_id, reviewed_at=moment.isoformat())]},
        )
        assert response.status_code == 200
        state = response.json()["states"][0]
        due = datetime.fromisoformat(state["due_at"])
        intervals.append((due - moment).total_seconds())
        moment = due

    assert intervals == sorted(intervals)
    assert intervals[-1] > intervals[0]
    assert state["state"] == "review"

    forgotten_at = datetime.now(tz=UTC) - timedelta(minutes=30)
    forgotten = await client.post(
        "/api/v1/study/reviews",
        headers=headers,
        json={"reviews": [_review(card_id, rating=1, reviewed_at=forgotten_at.isoformat())]},
    )
    lapsed = forgotten.json()["states"][0]
    assert lapsed["state"] == "relearning"
    assert lapsed["lapses"] == 1
    assert (datetime.fromisoformat(lapsed["due_at"]) - forgotten_at) == timedelta(minutes=10)

    # Просроченная карточка обязана вернуться в очередь.
    queue = await client.get(f"/api/v1/study/sets/{study_set['id']}/queue", headers=headers)
    assert card_id in {item["card"]["id"] for item in queue.json()["items"]}
    assert queue.json()["due_total"] == 1


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_daily_new_limit_caps_the_queue(
    _mock_send: AsyncMock, client: pytest.fixture
) -> None:
    headers = await _auth(client, "limits")
    study_set = await _set_with_cards(client, headers, count=10)

    updated = await client.patch(
        "/api/v1/study/settings", headers=headers, json={"new_cards_per_day": 3}
    )
    assert updated.status_code == 200
    assert updated.json()["new_cards_per_day"] == 3

    queue = await client.get(f"/api/v1/study/sets/{study_set['id']}/queue", headers=headers)
    assert len(queue.json()["items"]) == 3
    assert queue.json()["new_total"] == 10

    # Фильтры режима «Карточки» дневным лимитом не ограничены: это просмотр,
    # а не планирование повторений.
    browse = await client.get(
        f"/api/v1/study/sets/{study_set['id']}/queue",
        headers=headers,
        params={"mode": "flashcards", "scope": "all"},
    )
    assert len(browse.json()["items"]) == 10


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_stats_and_forecast_report_scheduled_load(
    _mock_send: AsyncMock, client: pytest.fixture
) -> None:
    headers = await _auth(client, "stats")
    study_set = await _set_with_cards(client, headers)
    card_id = study_set["cards"][0]["id"]

    await client.post(
        "/api/v1/study/reviews",
        headers=headers,
        json={"reviews": [_review(card_id, rating=4)]},
    )

    stats = await client.get(f"/api/v1/study/sets/{study_set['id']}/stats", headers=headers)
    assert stats.status_code == 200
    body = stats.json()
    assert body["cards_total"] == 4
    assert body["not_started_count"] == 3
    assert body["distribution"]["review"] == 1
    assert len(body["forecast"]) == 14
    assert sum(day["count"] for day in body["forecast"]) >= 1

    forecast = await client.get(
        "/api/v1/study/forecast", headers=headers, params={"days": 7}
    )
    assert len(forecast.json()) == 7


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_active_session_is_restored_not_duplicated(
    _mock_send: AsyncMock, client: pytest.fixture
) -> None:
    headers = await _auth(client, "session")
    study_set = await _set_with_cards(client, headers)
    payload = {"set_id": study_set["id"], "mode": "learn"}

    first = await client.post("/api/v1/study/sessions", headers=headers, json=payload)
    second = await client.post("/api/v1/study/sessions", headers=headers, json=payload)
    assert first.json()["id"] == second.json()["id"]

    active = await client.get(
        "/api/v1/study/sessions/active", headers=headers, params={"set_id": study_set["id"]}
    )
    assert active.json()["id"] == first.json()["id"]

    await client.post(f"/api/v1/study/sessions/{first.json()['id']}/finish", headers=headers)
    closed = await client.get(
        "/api/v1/study/sessions/active", headers=headers, params={"set_id": study_set["id"]}
    )
    assert closed.json() is None


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_finished_session_rejects_new_answers(
    _mock_send: AsyncMock, client: pytest.fixture
) -> None:
    headers = await _auth(client, "closed")
    study_set = await _set_with_cards(client, headers)
    session = await client.post(
        "/api/v1/study/sessions",
        headers=headers,
        json={"set_id": study_set["id"], "mode": "learn"},
    )
    session_id = session.json()["id"]
    await client.post(f"/api/v1/study/sessions/{session_id}/finish", headers=headers)

    response = await client.post(
        "/api/v1/study/reviews",
        headers=headers,
        json={
            "session_id": session_id,
            "reviews": [_review(study_set["cards"][0]["id"])],
        },
    )
    assert response.status_code == 409
    assert response.json()["code"] == "CONFLICT"


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_study_data_is_isolated_between_users(
    _mock_send: AsyncMock, client: pytest.fixture
) -> None:
    """Обязательный тест прав доступа: чужой прогресс недостижим ни одним путём."""
    owner = await _auth(client, "owner")
    stranger = await _auth(client, "stranger")
    study_set = await _set_with_cards(client, owner)
    card_id = study_set["cards"][0]["id"]

    session = await client.post(
        "/api/v1/study/sessions",
        headers=owner,
        json={"set_id": study_set["id"], "mode": "learn"},
    )
    session_id = session.json()["id"]

    assert (
        await client.get(f"/api/v1/study/sets/{study_set['id']}/queue", headers=stranger)
    ).status_code == 403
    assert (
        await client.get(f"/api/v1/study/sets/{study_set['id']}/stats", headers=stranger)
    ).status_code == 403
    assert (
        await client.get(
            "/api/v1/study/sessions/active",
            headers=stranger,
            params={"set_id": study_set["id"]},
        )
    ).status_code == 403
    assert (
        await client.post(f"/api/v1/study/sessions/{session_id}/finish", headers=stranger)
    ).status_code == 403
    assert (
        await client.post(
            "/api/v1/study/sessions",
            headers=stranger,
            json={"set_id": study_set["id"], "mode": "learn"},
        )
    ).status_code == 403

    # Ответ по чужой карточке не отклоняется ошибкой, но и не пишется:
    # клиент с рассинхронизированной очередью не должен получить 500.
    foreign = await client.post(
        "/api/v1/study/reviews", headers=stranger, json={"reviews": [_review(card_id)]}
    )
    assert foreign.status_code == 200
    assert foreign.json()["accepted"] == []
    assert len(foreign.json()["rejected"]) == 1

    owner_stats = await client.get(
        f"/api/v1/study/sets/{study_set['id']}/stats", headers=owner
    )
    assert owner_stats.json()["distribution"]["new"] == 4


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_settings_validation_rejects_impossible_values(
    _mock_send: AsyncMock, client: pytest.fixture
) -> None:
    headers = await _auth(client, "settings")

    defaults = await client.get("/api/v1/study/settings", headers=headers)
    assert defaults.json()["fsrs_desired_retention"] == 0.9

    rejected = await client.patch(
        "/api/v1/study/settings", headers=headers, json={"fsrs_desired_retention": 1.5}
    )
    assert rejected.status_code == 422
    assert rejected.json()["code"] == "VALIDATION_ERROR"


async def test_study_endpoints_require_authentication(client: pytest.fixture) -> None:
    set_id = str(uuid4())
    assert (await client.get(f"/api/v1/study/sets/{set_id}/queue")).status_code == 401
    assert (await client.get("/api/v1/study/settings")).status_code == 401
    assert (
        await client.post("/api/v1/study/reviews", json={"reviews": [_review(str(uuid4()))]})
    ).status_code == 401
