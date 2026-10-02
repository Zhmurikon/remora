"""Минимальная админ-панель: только чтение и строгая проверка роли."""

from httpx import AsyncClient
from sqlalchemy import update

from app.db.session import get_engine
from app.models.user import User, UserRole
from tests.test_courses import auth


async def promote(username: str, role: UserRole) -> None:
    async with get_engine().begin() as conn:
        await conn.execute(update(User).where(User.username == username).values(role=role))


async def test_admin_endpoints_require_admin_role(client: AsyncClient) -> None:
    regular = await auth(client, "admin-regular")
    moderator = await auth(client, "admin-moderator")
    await promote("courseadmin-moderator", UserRole.moderator)

    for path in ("/api/v1/admin/overview", "/api/v1/admin/users"):
        assert (await client.get(path)).status_code == 401
        for headers in (regular, moderator):
            response = await client.get(path, headers=headers)
            assert response.status_code == 403
            assert response.json()["code"] == "FORBIDDEN"


async def test_admin_sees_overview_and_searchable_users(client: AsyncClient) -> None:
    admin_headers = await auth(client, "admin-owner")
    await promote("courseadmin-owner", UserRole.admin)
    creator_headers = await auth(client, "admin-creator")
    await client.post("/api/v1/sets", headers=creator_headers, json={"title": "Набор автора"})

    overview = await client.get("/api/v1/admin/overview", headers=admin_headers)
    assert overview.status_code == 200, overview.text
    payload = overview.json()
    assert payload["users_total"] == 2
    assert payload["users_new_7d"] == 2
    assert payload["users_active_7d"] == 0
    assert payload["reviews_7d"] == 0
    assert payload["sets_total"] == 1
    assert payload["courses_total"] == 0
    assert payload["courses_published"] == 0
    assert payload["reports_open"] == 0

    users = await client.get("/api/v1/admin/users?query=admin-creator", headers=admin_headers)
    assert users.status_code == 200, users.text
    body = users.json()
    assert body["total"] == 1
    assert body["offset"] == 0
    assert body["limit"] == 25
    assert body["items"][0]["username"] == "courseadmin-creator"
    assert body["items"][0]["email"] == "course-admin-creator@example.com"
    assert body["items"][0]["sets_count"] == 1
    assert body["items"][0]["courses_count"] == 0
    assert body["items"][0]["reviews_count"] == 0
    assert "password_hash" not in body["items"][0]

    missing = await client.get(
        "/api/v1/admin/users?query=такого-пользователя-нет", headers=admin_headers
    )
    assert missing.status_code == 200
    assert missing.json()["items"] == []
    assert missing.json()["total"] == 0
