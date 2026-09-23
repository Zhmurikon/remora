"""Жизненный цикл набора и изоляция контента пользователей."""

from unittest.mock import AsyncMock, patch

import pytest

from tests.test_courses import legacy_visibility


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
    assert created.json()["visibility"] == "public"
    set_id = created.json()["id"]

    public = await client.get(f"/api/v1/sets/public/{created.json()['slug']}")
    assert public.status_code == 200
    assert public.json()["course_url"] is None

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

    rich_content = await client.put(
        f"/api/v1/sets/{set_id}/cards",
        headers=headers,
        json={
            "cards": [
                {"term": "x^2", "definition": "x \\cdot x", "content_type": "latex"},
                {
                    "term": "const answer = 42",
                    "definition": "TypeScript",
                    "content_type": "code",
                    "code_language": "typescript",
                },
            ]
        },
    )
    assert rich_content.status_code == 200
    assert rich_content.json()["cards"][0]["content_type"] == "latex"
    assert rich_content.json()["cards"][1]["code_language"] == "typescript"

    updated = await client.patch(
        f"/api/v1/sets/{set_id}",
        headers=headers,
        json={
            "title": "Машинное обучение от статистики до нейросетей",
            "description": "",
            "visibility": "private",
            "lang_term": "ru",
            "lang_definition": "ru",
            "folder_id": None,
        },
    )
    assert updated.status_code == 200
    assert updated.json()["title"] == "Машинное обучение от статистики до нейросетей"
    assert len(updated.json()["cards"]) == 2

    invalid_code = await client.put(
        f"/api/v1/sets/{set_id}/cards",
        headers=headers,
        json={"cards": [{"term": "print(1)", "definition": "Python", "content_type": "code"}]},
    )
    assert invalid_code.status_code == 409

    duplicate = await client.post(f"/api/v1/sets/{set_id}/duplicate", headers=headers)
    assert duplicate.status_code == 201
    assert duplicate.json()["cards_count"] == 2
    assert duplicate.json()["cards"][1]["content_type"] == "code"

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


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_public_link_respects_visibility_and_limits_ssr_cards(
    mock_send: AsyncMock, client: pytest.fixture
) -> None:
    owner = await _auth(client, "publicowner")
    private_set = await client.post(
        "/api/v1/sets",
        headers=owner,
        json={"title": "Секретный набор", "visibility": "private"},
    )
    private_slug = private_set.json()["slug"]
    assert (await client.get(f"/api/v1/sets/public/{private_slug}")).status_code == 404

    public_set = await client.post(
        "/api/v1/sets",
        headers=owner,
        json={"title": "Открытая физика"},
    )
    set_id = public_set.json()["id"]
    await legacy_visibility(set_id, "unlisted")
    cards = [
        {"term": f"Термин {index}", "definition": f"Определение {index}"} for index in range(55)
    ]
    await client.put(f"/api/v1/sets/{set_id}/cards", headers=owner, json={"cards": cards})

    course = (
        await client.post(
            "/api/v1/courses", headers=owner, json={"title": "Физика", "set_id": set_id}
        )
    ).json()
    await client.post(f"/api/v1/courses/{course['id']}/publish", headers=owner, json={})

    response = await client.get(f"/api/v1/sets/public/{public_set.json()['slug']}")
    assert response.status_code == 200
    assert response.json()["cards_count"] == 55
    assert len(response.json()["cards"]) == 50
    assert response.json()["author"]["username"] == "contentpublicowner"

    deleted = await client.delete(f"/api/v1/sets/{set_id}", headers=owner)
    assert deleted.status_code == 204
    assert (await client.get(f"/api/v1/sets/public/{public_set.json()['slug']}")).status_code == 404


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_folders_organize_sets_and_delete_safely(
    mock_send: AsyncMock, client: pytest.fixture
) -> None:
    headers = await _auth(client, "folders")
    folder = await client.post(
        "/api/v1/folders", headers=headers, json={"title": "Языки", "color": "blue"}
    )
    assert folder.status_code == 201
    folder_id = folder.json()["id"]
    child = await client.post(
        "/api/v1/folders",
        headers=headers,
        json={"title": "Английский", "parent_id": folder_id},
    )
    assert child.status_code == 201

    renamed = await client.patch(
        f"/api/v1/folders/{folder_id}", headers=headers, json={"title": "Все языки"}
    )
    assert renamed.status_code == 200
    assert renamed.json()["title"] == "Все языки"

    created = await client.post(
        "/api/v1/sets",
        headers=headers,
        json={"title": "Слова", "folder_id": folder_id},
    )
    assert created.status_code == 201
    assert created.json()["folder_id"] == folder_id

    assert (await client.delete(f"/api/v1/folders/{folder_id}", headers=headers)).status_code == 204
    folders = (await client.get("/api/v1/folders", headers=headers)).json()
    assert folders[0]["parent_id"] is None
    loaded = await client.get(f"/api/v1/sets/{created.json()['id']}", headers=headers)
    assert loaded.json()["folder_id"] is None


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_user_cannot_use_another_users_folder(
    mock_send: AsyncMock, client: pytest.fixture
) -> None:
    owner = await _auth(client, "folderowner")
    stranger = await _auth(client, "folderstranger")
    folder = await client.post("/api/v1/folders", headers=owner, json={"title": "Личное"})
    folder_id = folder.json()["id"]

    assert (
        await client.patch(
            f"/api/v1/folders/{folder_id}", headers=stranger, json={"title": "Чужое"}
        )
    ).status_code == 403
    assert (
        await client.post(
            "/api/v1/sets", headers=stranger, json={"title": "Набор", "folder_id": folder_id}
        )
    ).status_code == 403
    assert (
        await client.delete(f"/api/v1/folders/{folder_id}", headers=stranger)
    ).status_code == 403
