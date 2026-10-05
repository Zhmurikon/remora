"""Битвы: одинаковый снимок, права, идемпотентность и отсутствие влияния на FSRS."""

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest


async def _auth(client: pytest.fixture, suffix: str) -> dict[str, str]:
    await client.post(
        "/api/v1/auth/register",
        json={
            "email": f"battle-{suffix}@example.com",
            "password": "Str0ngP@ss!",
            "username": f"battle{suffix}",
        },
    )
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": f"battle-{suffix}@example.com", "password": "Str0ngP@ss!"},
    )
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


async def _set_with_cards(client: pytest.fixture, headers: dict[str, str]) -> dict[str, object]:
    created = await client.post(
        "/api/v1/sets",
        headers=headers,
        json={"title": "География", "lang_term": "ru", "lang_definition": "en"},
    )
    set_id = created.json()["id"]
    rows = [
        ("кошка", "cat"),
        ("собака", "dog"),
        ("лошадь", "horse"),
        ("корова", "cow"),
        ("птица", "bird"),
        ("рыба", "fish"),
    ]
    saved = await client.put(
        f"/api/v1/sets/{set_id}/cards",
        headers=headers,
        json={"cards": [{"term": term, "definition": definition} for term, definition in rows]},
    )
    return {"id": set_id, "cards": saved.json()["cards"]}


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_battle_keeps_snapshot_and_hides_answers(
    _mock_send: AsyncMock, client: pytest.fixture
) -> None:
    owner = await _auth(client, "owner")
    opponent = await _auth(client, "opponent")
    material = await _set_with_cards(client, owner)
    request_key = str(uuid4())

    created = await client.post(
        "/api/v1/battles",
        headers=owner,
        json={"set_id": material["id"], "question_count": 4, "request_key": request_key},
    )
    assert created.status_code == 201, created.text
    battle = created.json()
    assert {"answer", "expected", "alt_answers"}.isdisjoint(battle["questions"][0])

    retried = await client.post(
        "/api/v1/battles",
        headers=owner,
        json={"set_id": material["id"], "question_count": 4, "request_key": request_key},
    )
    assert retried.status_code == 201
    assert retried.json()["id"] == battle["id"]
    assert [item["id"] for item in retried.json()["questions"]] == [
        item["id"] for item in battle["questions"]
    ]

    joined = await client.post(
        "/api/v1/battles/join",
        headers=opponent,
        json={"invite_token": battle["invite_token"]},
    )
    assert joined.status_code == 200, joined.text
    assert [item["id"] for item in joined.json()["questions"]] == [
        item["id"] for item in battle["questions"]
    ]
    assert len(joined.json()["participants"]) == 2
    assert all(item["is_connected"] for item in joined.json()["participants"])


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_battle_rejects_private_set(_mock_send: AsyncMock, client: pytest.fixture) -> None:
    owner = await _auth(client, "private")
    material = await _set_with_cards(client, owner)
    updated = await client.patch(
        f"/api/v1/sets/{material['id']}",
        headers=owner,
        json={
            "title": "География",
            "visibility": "private",
            "lang_term": "ru",
            "lang_definition": "en",
        },
    )
    assert updated.status_code == 200
    response = await client.post(
        "/api/v1/battles",
        headers=owner,
        json={"set_id": material["id"], "question_count": 4, "request_key": str(uuid4())},
    )
    assert response.status_code == 409
    assert response.json()["code"] == "CONFLICT"


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_battle_answers_are_idempotent_and_do_not_change_schedule(
    _mock_send: AsyncMock, client: pytest.fixture
) -> None:
    owner = await _auth(client, "answersowner")
    opponent = await _auth(client, "answersopponent")
    stranger = await _auth(client, "answersstranger")
    material = await _set_with_cards(client, owner)
    cards = {item["id"]: item for item in material["cards"]}  # type: ignore[union-attr]
    created = await client.post(
        "/api/v1/battles",
        headers=owner,
        json={"set_id": material["id"], "question_count": 4, "request_key": str(uuid4())},
    )
    battle = created.json()
    battle_id = battle["id"]
    assert (
        await client.post(
            "/api/v1/battles/join",
            headers=opponent,
            json={"invite_token": battle["invite_token"]},
        )
    ).status_code == 200
    assert (
        await client.post(
            "/api/v1/battles/join",
            headers=stranger,
            json={"invite_token": battle["invite_token"]},
        )
    ).status_code == 409
    assert (await client.get(f"/api/v1/battles/{battle_id}", headers=stranger)).status_code == 403

    moment = datetime.now(tz=UTC)
    with patch("app.services.battles._now", return_value=moment):
        assert (
            await client.post(f"/api/v1/battles/{battle_id}/ready", headers=owner)
        ).status_code == 200
        ready = await client.post(f"/api/v1/battles/{battle_id}/ready", headers=opponent)
        assert ready.status_code == 200
        assert ready.json()["status"] == "countdown"

    with patch("app.services.battles._now", return_value=moment + timedelta(seconds=4)):
        question = battle["questions"][0]
        correct = cards[question["card_id"]]["definition"]
        response = await client.post(
            f"/api/v1/battles/{battle_id}/answers",
            headers=owner,
            json={
                "client_answer_id": str(uuid4()),
                "question_id": question["id"],
                "value": correct,
            },
        )
        assert response.status_code == 200, response.text
        assert response.json()["room"]["status"] == "active"
        assert response.json()["room"]["participants"][0]["correct_count"] is None

        duplicate_id = str(uuid4())
        first = await client.post(
            f"/api/v1/battles/{battle_id}/answers",
            headers=owner,
            json={
                "client_answer_id": duplicate_id,
                "question_id": battle["questions"][1]["id"],
                "value": "мимо",
            },
        )
        again = await client.post(
            f"/api/v1/battles/{battle_id}/answers",
            headers=owner,
            json={
                "client_answer_id": duplicate_id,
                "question_id": battle["questions"][1]["id"],
                "value": "мимо",
            },
        )
        assert first.status_code == 200
        assert again.status_code == 200
        assert again.json()["duplicate"] is True

        for question in battle["questions"][2:]:
            response = await client.post(
                f"/api/v1/battles/{battle_id}/answers",
                headers=owner,
                json={
                    "client_answer_id": str(uuid4()),
                    "question_id": question["id"],
                    "value": "мимо",
                },
            )
            assert response.status_code == 200, response.text
        for question in battle["questions"]:
            response = await client.post(
                f"/api/v1/battles/{battle_id}/answers",
                headers=opponent,
                json={
                    "client_answer_id": str(uuid4()),
                    "question_id": question["id"],
                    "value": "мимо",
                },
            )
            assert response.status_code == 200, response.text
        result = await client.get(f"/api/v1/battles/{battle_id}/result", headers=owner)
        assert result.status_code == 200
        assert result.json()["winner_id"] is not None
        assert len(result.json()["review"]) == 4

    stats = await client.get(f"/api/v1/study/sets/{material['id']}/stats", headers=owner)
    assert stats.status_code == 200
    assert stats.json()["distribution"] == {"new": 6, "learning": 0, "review": 0, "relearning": 0}
    retention = await client.get("/api/v1/retention/summary", headers=owner)
    assert retention.status_code == 200
    assert retention.json()["reviews_today"] == 4
    assert retention.json()["xp_today"] > 0
