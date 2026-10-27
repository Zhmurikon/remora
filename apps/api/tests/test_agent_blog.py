from copy import deepcopy
from uuid import UUID, uuid4

from httpx import AsyncClient

from app.db.session import get_session_factory
from app.models.user import UserRole
from app.repositories.user import get_user_by_username
from tests.test_agent_api import token
from tests.test_study import _auth


def post_body() -> dict[str, object]:
    return {
        "slug": "intervalnoe-povtorenie",
        "title": "Как работает интервальное повторение",
        "description": "Короткое практическое объяснение без обещаний выучить всё мгновенно.",
        "category": "Учебные привычки",
        "tone": "mint",
        "diagram": ["Материал", "Интервал", "Проверка"],
        "sections": [
            {
                "id": "princip",
                "title": "Принцип повторения",
                "rich_text": (
                    "## Главное\n\n- Вспомните ответ\n- Проверьте себя"
                    "\n\n> Ошибка — часть обучения."
                ),
            }
        ],
        "sources": [{"title": "Исследование", "url": "https://example.com/research"}],
        "related": ["kak-sozdat-kartochki"],
    }


async def make_admin(client: AsyncClient, username: str) -> dict[str, str]:
    headers = await _auth(client, username)
    async with get_session_factory()() as db:
        user = await get_user_by_username(db, f"study{username}")
        assert user is not None
        user.role = UserRole.admin
        await db.commit()
    return headers


async def test_blog_agent_draft_revision_publication_and_public_read(client: AsyncClient) -> None:
    owner = await make_admin(client, "blogeditor")
    write, _ = await token(client, owner, scopes=["blog:read", "blog:write", "blog:publish"])
    created_response = await client.post(
        "/api/v1/agent/blog/posts", headers=write, json=post_body()
    )
    assert created_response.status_code == 201, created_response.text
    created = created_response.json()
    assert created["status"] == "draft" and created["revision"] == 1
    assert (await client.get("/api/v1/blog/posts")).json() == []
    assert (await client.get(f"/api/v1/blog/posts/{created['slug']}")).status_code == 404

    changed_body = deepcopy(post_body())
    changed_body["title"] = "Интервальное повторение: как начать"
    changed_body["revision"] = created["revision"]
    write["Idempotency-Key"] = str(uuid4())
    changed = await client.put(
        f"/api/v1/agent/blog/posts/{created['id']}", headers=write, json=changed_body
    )
    assert changed.status_code == 200 and changed.json()["revision"] == 2
    write["Idempotency-Key"] = str(uuid4())
    stale = await client.put(
        f"/api/v1/agent/blog/posts/{created['id']}", headers=write, json=changed_body
    )
    assert stale.status_code == 409

    write["Idempotency-Key"] = str(uuid4())
    published = await client.post(
        f"/api/v1/agent/blog/posts/{created['id']}/publish",
        headers=write,
        json={"revision": changed.json()["revision"]},
    )
    assert published.status_code == 200 and published.json()["status"] == "published"
    public = (await client.get(f"/api/v1/blog/posts/{created['slug']}")).json()
    assert public["title"] == changed_body["title"]
    assert public["sections"][0]["richText"].startswith("## Главное")
    assert public["publishedAt"] and public["updatedAt"]
    summary = (await client.get("/api/v1/blog/posts?offset=0&limit=100")).json()[0]
    assert summary["slug"] == created["slug"] and summary["readingMinutes"] >= 1
    assert "sections" not in summary

    write["Idempotency-Key"] = str(uuid4())
    blocked = await client.put(
        f"/api/v1/agent/blog/posts/{created['id']}",
        headers=write,
        json={**changed_body, "revision": published.json()["revision"]},
    )
    assert blocked.status_code == 409


async def test_blog_scopes_and_admin_isolation(client: AsyncClient) -> None:
    regular = await _auth(client, "blogregular")
    forbidden = await client.post(
        "/api/v1/users/me/api-tokens",
        headers=regular,
        json={"name": "Блог", "scopes": ["blog:read"]},
    )
    assert forbidden.status_code == 403

    owner = await make_admin(client, "blogadmin")
    reader, _ = await token(client, owner, scopes=["blog:read"])
    assert (await client.get("/api/v1/agent/blog/posts", headers=reader)).status_code == 200
    assert (
        await client.post("/api/v1/agent/blog/posts", headers=reader, json=post_body())
    ).status_code == 403
    assert (
        await client.post(
            "/api/v1/agent/blog/media",
            headers=reader,
            json={"data_base64": "not-base64", "mime": "image/png"},
        )
    ).status_code == 403

    writer, _ = await token(client, owner, scopes=["blog:write"])
    assert (
        await client.post(
            "/api/v1/agent/blog/media",
            headers=writer,
            json={"data_base64": "not-base64", "mime": "image/png"},
        )
    ).status_code == 409
    writer["Idempotency-Key"] = str(uuid4())
    created = await client.post("/api/v1/agent/blog/posts", headers=writer, json=post_body())
    assert created.status_code == 201
    assert UUID(created.json()["id"])
    writer["Idempotency-Key"] = str(uuid4())
    assert (
        await client.post(
            f"/api/v1/agent/blog/posts/{created.json()['id']}/publish",
            headers=writer,
            json={"revision": 1},
        )
    ).status_code == 403

    async with get_session_factory()() as db:
        admin = await get_user_by_username(db, "studyblogadmin")
        assert admin is not None
        admin.role = UserRole.user
        await db.commit()
    assert (await client.get("/api/v1/agent/blog/posts", headers=reader)).status_code == 403
