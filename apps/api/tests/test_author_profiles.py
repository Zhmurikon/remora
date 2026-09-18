"""Публичный профиль не раскрывает черновики и ранжирует похожие курсы по тегам."""

from httpx import AsyncClient
from sqlalchemy import update

from app.db.session import get_engine
from app.models.user import User, UserStatus
from tests.test_courses import auth


async def _course(client: AsyncClient, headers: dict[str, str], title: str, tags: list[str]):
    study_set = (await client.post("/api/v1/sets", headers=headers, json={"title": title})).json()
    await client.put(
        f"/api/v1/sets/{study_set['id']}/cards",
        headers=headers,
        json={"cards": [{"term": title, "definition": "Ответ"}]},
    )
    course = (
        await client.post(
            "/api/v1/courses", headers=headers, json={"title": title, "set_id": study_set["id"]}
        )
    ).json()
    published = await client.post(
        f"/api/v1/courses/{course['id']}/publish", headers=headers, json={"tags": tags}
    )
    assert published.status_code == 200
    return published.json(), study_set


async def test_public_profile_metrics_and_only_available_courses(client: AsyncClient) -> None:
    owner = await auth(client, "profile-author")
    reader = await auth(client, "profile-reader")
    private_user = await auth(client, "profile-private")
    private_me = (await client.get("/api/v1/auth/me", headers=private_user)).json()
    assert (await client.get(f"/api/v1/authors/{private_me['username']}")).status_code == 404
    me = (await client.get("/api/v1/auth/me", headers=owner)).json()
    course, study_set = await _course(client, owner, "Алгебра", ["математика"])
    article_id = course["sections"][0]["articles"][0]["id"]
    draft_set = (
        await client.post("/api/v1/sets", headers=owner, json={"title": "Черновик"})
    ).json()
    await client.post(
        "/api/v1/courses", headers=owner, json={"title": "Секрет", "set_id": draft_set["id"]}
    )
    assert (
        await client.post(f"/api/v1/courses/public/{course['slug']}/like", headers=reader)
    ).status_code == 200
    for target_type, target_id in (
        ("course", course["id"]),
        ("article", article_id),
        ("set", study_set["id"]),
    ):
        assert (
            await client.post(
                "/api/v1/library",
                headers=reader,
                json={"target_type": target_type, "target_id": target_id},
            )
        ).status_code == 201

    response = await client.get(f"/api/v1/authors/{me['username']}")
    assert response.status_code == 200
    profile = response.json()
    assert profile["display_name"] == me["display_name"]
    assert profile["stats"] == {
        "publications": 1,
        "saves_received": 3,
        "likes_received": 1,
        "cards_studied": 0,
        "current_streak_days": 0,
    }
    assert [item["title"] for item in profile["courses"]] == ["Алгебра"]
    assert "email" not in profile
    assert profile["badges"] == []

    async with get_engine().begin() as connection:
        await connection.execute(
            update(User).where(User.id == me["id"]).values(status=UserStatus.suspended)
        )
    assert (await client.get(f"/api/v1/authors/{me['username']}")).status_code == 404


async def test_related_courses_rank_shared_tags_and_hide_unpublished(client: AsyncClient) -> None:
    owner = await auth(client, "related-author")
    source, _ = await _course(client, owner, "Источник", ["математика", "экзамен"])
    closest, _ = await _course(client, owner, "Ближайший", ["математика", "экзамен"])
    partial, _ = await _course(client, owner, "Частичный", ["математика"])
    hidden, _ = await _course(client, owner, "Скрытый", ["математика", "экзамен"])
    unrelated, _ = await _course(client, owner, "Другой", ["история"])
    await client.post(f"/api/v1/courses/{hidden['id']}/unpublish", headers=owner)

    response = await client.get(f"/api/v1/courses/public/{source['slug']}/related")
    assert response.status_code == 200
    assert [item["id"] for item in response.json()] == [closest["id"], partial["id"]]
    assert hidden["id"] not in {item["id"] for item in response.json()}
    assert unrelated["id"] not in {item["id"] for item in response.json()}
    assert (await client.get("/api/v1/courses/public/missing/related")).status_code == 404


async def test_sitemap_contains_only_indexable_courses(client: AsyncClient) -> None:
    owner = await auth(client, "sitemap-author")
    me = (await client.get("/api/v1/auth/me", headers=owner)).json()
    visible, _ = await _course(client, owner, "В карте", ["математика"])
    hidden, _ = await _course(client, owner, "Скрытый", ["математика"])
    await client.post(f"/api/v1/courses/{hidden['id']}/unpublish", headers=owner)

    response = await client.get("/api/v1/courses/sitemap")

    assert response.status_code == 200
    assert [entry["slug"] for entry in response.json()] == [visible["slug"]]
    assert response.json()[0]["author_username"] == me["username"]
