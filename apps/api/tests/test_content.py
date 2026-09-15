"""Жизненный цикл набора и изоляция контента пользователей."""

from unittest.mock import AsyncMock, patch

import pytest


async def _auth(client: pytest.fixture, suffix: str) -> dict[str, str]:
    email = f"content-{suffix}@example.com"
    await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "Str0ngP@ss!", "username": f"content{suffix}"},
    )
    login = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": "Str0ngP@ss!"}
    )
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_set_lifecycle_and_card_batch(mock_send: AsyncMock, client: pytest.fixture) -> None:
    headers = await _auth(client, "owner")
    created = await client.post(
        "/api/v1/sets",
        headers=headers,
        json={"title": "Английские слова", "description": "Первый набор"},
    )
    assert created.status_code == 201
    set_id = created.json()["id"]

    saved = await client.put(
        f"/api/v1/sets/{set_id}/cards",
        headers=headers,
        json={
            "cards": [
                {"term": "memory", "definition": "память"},
                {"term": "learn", "definition": "учиться"},
            ]
        },
    )
    assert saved.status_code == 200
    assert saved.json()["cards_count"] == 2
    first, second = saved.json()["cards"]

    reordered = await client.put(
        f"/api/v1/sets/{set_id}/cards",
        headers=headers,
        json={
            "cards": [
                {"id": second["id"], "term": second["term"], "definition": "изучать"},
                {"id": first["id"], "term": first["term"], "definition": first["definition"]},
            ]
        },
    )
    assert reordered.status_code == 200
    assert [card["position"] for card in reordered.json()["cards"]] == [0, 1]
    assert reordered.json()["cards"][0]["definition"] == "изучать"

    duplicate = await client.post(f"/api/v1/sets/{set_id}/duplicate", headers=headers)
    assert duplicate.status_code == 201
    assert duplicate.json()["cards_count"] == 2

    deleted = await client.delete(f"/api/v1/sets/{set_id}", headers=headers)
    assert deleted.status_code == 204
    assert (await client.get(f"/api/v1/sets/{set_id}", headers=headers)).status_code == 404


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_user_cannot_access_another_users_set(
    mock_send: AsyncMock, client: pytest.fixture
) -> None:
    owner = await _auth(client, "first")
    stranger = await _auth(client, "second")
    created = await client.post("/api/v1/sets", headers=owner, json={"title": "Личный"})
    set_id = created.json()["id"]

    assert (await client.get(f"/api/v1/sets/{set_id}", headers=stranger)).status_code == 403
    assert (
        await client.put(
            f"/api/v1/sets/{set_id}/cards",
            headers=stranger,
            json={"cards": [{"term": "чужое", "definition": "нельзя"}]},
        )
    ).status_code == 403
    assert (await client.delete(f"/api/v1/sets/{set_id}", headers=stranger)).status_code == 403
