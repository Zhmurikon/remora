"""Публикация не раскрывает черновики и не обходится через старую ссылку набора."""

import pytest
from httpx import AsyncClient
from sqlalchemy import update

from app.db.session import get_engine
from app.models.courses import Course
from app.models.user import User, UserStatus
from tests.test_courses import auth, legacy_visibility


async def test_course_cards_pagination_revision_and_access(client: AsyncClient) -> None:
    owner = await auth(client, "pagination")
    study_set = (
        await client.post("/api/v1/sets", headers=owner, json={"title": "Большой набор"})
    ).json()
    cards = [{"term": f"Термин {i}", "definition": f"Ответ {i}"} for i in range(123)]
    cards_path = f"/api/v1/sets/{study_set['id']}/cards"
    assert (await client.put(cards_path, headers=owner, json={"cards": cards})).status_code == 200
    course = (
        await client.post(
            "/api/v1/courses", headers=owner, json={"title": "Курс", "set_id": study_set["id"]}
        )
    ).json()
    course_path = f"/api/v1/courses/{course['id']}"
    assert (await client.post(course_path + "/publish", headers=owner, json={})).status_code == 200
    article_id = course["sections"][0]["articles"][0]["id"]
    path = f"/api/v1/courses/public/{course['slug']}/articles/{article_id}"
    first = (await client.get(path)).json()
    assert len(first["cards"]) == 50
    assert first["next_cursor"] == 49
    query = {"after": first["next_cursor"], "revision": first["updated_at"]}
    second = (await client.get(path, params=query)).json()
    assert len(second["cards"]) == 50
    third = (await client.get(path, params={**query, "after": second["next_cursor"]})).json()
    assert len(third["cards"]) == 23
    assert third["next_cursor"] is None
    assert [c["term"] for page in (first, second, third) for c in page["cards"]] == [
        c["term"] for c in cards
    ]
    assert (await client.get(path, params={"after": -1})).status_code == 422
    assert (await client.get(path, params={"after": 49})).status_code == 409
    cards[0]["definition"] = "Изменено без изменения числа карточек"
    assert (await client.put(cards_path, headers=owner, json={"cards": cards})).status_code == 200
    assert (await client.get(path, params=query)).status_code == 409
    await client.post(course_path + "/unpublish", headers=owner)
    assert (await client.get(path, params=query)).status_code == 404


async def test_authenticated_user_can_like_public_course_once(client: AsyncClient) -> None:
    owner = await auth(client, "liked-owner")
    reader = await auth(client, "liked-reader")
    other_reader = await auth(client, "liked-other")
    study_set = (
        await client.post("/api/v1/sets", headers=owner, json={"title": "Лайки"})
    ).json()
    await client.put(
        f"/api/v1/sets/{study_set['id']}/cards",
        headers=owner,
        json={"cards": [{"term": "A", "definition": "B"}]},
    )
    course = (
        await client.post(
            "/api/v1/courses", headers=owner, json={"title": "Курс", "set_id": study_set["id"]}
        )
    ).json()
    await client.post(f"/api/v1/courses/{course['id']}/publish", headers=owner, json={})
    public_path = f"/api/v1/courses/public/{course['slug']}"

    anonymous = (await client.get(public_path)).json()
    assert anonymous["likes_count"] == 0
    assert anonymous["liked_by_me"] is False
    assert (await client.post(public_path + "/like")).status_code == 401

    liked = await client.post(public_path + "/like", headers=reader)
    assert liked.status_code == 200
    assert liked.json()["likes_count"] == 1
    assert liked.json()["liked_by_me"] is True
    repeated = await client.post(public_path + "/like", headers=reader)
    assert repeated.json()["likes_count"] == 1
    second_like = await client.post(public_path + "/like", headers=other_reader)
    assert second_like.json()["likes_count"] == 2
    assert (await client.get(public_path, headers=reader)).json()["liked_by_me"] is True

    unliked = await client.delete(public_path + "/like", headers=reader)
    assert unliked.status_code == 200
    assert unliked.json()["likes_count"] == 1
    assert unliked.json()["liked_by_me"] is False
    assert (await client.delete(public_path + "/like", headers=reader)).json()["likes_count"] == 1

    await client.post(f"/api/v1/courses/{course['id']}/unpublish", headers=owner)
    assert (await client.post(public_path + "/like", headers=reader)).status_code == 404


@pytest.mark.parametrize("visibility", ["private", "public", "unlisted"])
async def test_publication_access_and_nested_revocation(
    client: AsyncClient, visibility: str
) -> None:
    owner = await auth(client, "publisher")
    stranger = await auth(client, "reader")
    study_set = (await client.post("/api/v1/sets", headers=owner, json={"title": "Матрицы"})).json()
    await legacy_visibility(study_set["id"], visibility)
    course = (
        await client.post(
            "/api/v1/courses", headers=owner, json={"title": "Алгебра", "set_id": study_set["id"]}
        )
    ).json()
    path = f"/api/v1/courses/{course['id']}"
    public = f"/api/v1/courses/public/{course['slug']}"
    article_id = course["sections"][0]["articles"][0]["id"]
    material = f"{public}/articles/{article_id}"
    legacy = f"/api/v1/sets/public/{study_set['slug']}"
    assert (await client.get(public)).status_code == 404
    assert (await client.get(material)).status_code == 404
    assert (await client.get(legacy)).status_code == 404
    assert (await client.post(path + "/publish", headers=stranger, json={})).status_code == 403
    assert (await client.post(path + "/publish", json={})).status_code == 401
    invalid = await client.post(path + "/publish", headers=owner, json={"tags": ["<script>"]})
    assert invalid.status_code == 422
    assert invalid.json()["code"] == "VALIDATION_ERROR"
    assert (await client.post(path + "/publish", headers=owner, json={})).status_code == 409
    await client.put(
        f"/api/v1/sets/{study_set['id']}/cards",
        headers=owner,
        json={"cards": [{"term": "A", "definition": "Матрица"}]},
    )
    published = await client.post(
        path + "/publish",
        headers=owner,
        json={"tags": ["#Математика", "математика", "Линейная  алгебра"]},
    )
    assert published.status_code == 200, published.text
    assert published.json()["tags"] == ["математика", "линейная алгебра"]
    assert published.json()["moderation_status"] == "pending"
    assert (await client.get(public)).status_code == 200
    assert (await client.get(legacy)).json()[
        "course_url"
    ] == f"/kurs/{course['slug']}#article-{article_id}"
    assert (await client.get(material)).json()["cards"][0]["term"] == "A"
    assert (await client.get(f"{public}/articles/{course['id']}")).status_code == 404
    assert (await client.get(legacy)).json()["cards"][0]["term"] == "A"
    assert (await client.post(path + "/unpublish", headers=stranger)).status_code == 403
    assert (await client.post(path + "/unpublish", headers=owner)).status_code == 200
    assert (await client.get(material)).status_code == 404
    assert (await client.get(public)).status_code == 404
    assert (await client.get(legacy)).status_code == 404
    assert (await client.get(f"/api/v1/sets/{study_set['id']}", headers=owner)).status_code == 200
    assert (await client.post(path + "/publish", headers=owner, json={})).status_code == 200
    async with get_engine().begin() as conn:
        await conn.execute(update(Course).values(moderation_status="blocked"))
    assert (await client.get(public)).status_code == 404
    assert (await client.get(legacy)).status_code == 404
    assert (await client.post(path + "/publish", headers=owner, json={})).status_code == 403
    async with get_engine().begin() as conn:
        await conn.execute(update(Course).values(moderation_status="ok"))
        await conn.execute(update(User).values(status=UserStatus.suspended))
    assert (await client.get(public)).status_code == 404
    assert (await client.get(legacy)).status_code == 404
