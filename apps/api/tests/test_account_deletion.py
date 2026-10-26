"""Мягкое и окончательное удаление аккаунта."""

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch

from httpx import AsyncClient
from sqlalchemy import select

from app.db.session import get_session_factory
from app.models.courses import Course
from app.models.user import User, UserStatus
from app.services.account_deletion import purge_due_accounts


async def _account(client: AsyncClient, suffix: str) -> tuple[dict[str, str], str]:
    email = f"delete-{suffix}@example.com"
    await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "Str0ngP@ss!", "username": f"delete{suffix}"},
    )
    login = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": "Str0ngP@ss!"}
    )
    return {"Authorization": f"Bearer {login.json()['access_token']}"}, email


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_deletion_closes_account_and_purges_after_30_days(
    _email: AsyncMock, client: AsyncClient
) -> None:
    headers, email = await _account(client, "all")
    created_set = await client.post("/api/v1/sets", headers=headers, json={"title": "Личный набор"})
    created_course = await client.post(
        "/api/v1/courses",
        headers=headers,
        json={"title": "Личный курс", "set_id": created_set.json()["id"]},
    )
    course_id = created_course.json()["id"]
    wrong = await client.post(
        "/api/v1/auth/delete-account",
        headers=headers,
        json={"password": "wrong", "confirmation": "УДАЛИТЬ", "public_content": "delete"},
    )
    assert wrong.status_code == 401

    deleted = await client.post(
        "/api/v1/auth/delete-account",
        headers=headers,
        json={
            "password": "Str0ngP@ss!",
            "confirmation": "УДАЛИТЬ",
            "public_content": "delete",
        },
    )
    assert deleted.status_code == 200
    assert (await client.get("/api/v1/auth/me", headers=headers)).status_code == 401
    assert (
        await client.post("/api/v1/auth/login", json={"email": email, "password": "Str0ngP@ss!"})
    ).status_code == 401

    async with get_session_factory()() as db:
        user = await db.scalar(select(User).where(User.email == email))
        assert user is not None
        user.deleted_at = datetime.now(UTC) - timedelta(days=31)
        await db.commit()
        with patch("app.services.account_deletion.get_object_storage") as storage:
            storage.return_value.delete_many = AsyncMock()
            assert await purge_due_accounts(db) == 1
        assert await db.scalar(select(User).where(User.email == email)) is None
        assert await db.get(Course, course_id) is None


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_public_courses_can_be_anonymized(_email: AsyncMock, client: AsyncClient) -> None:
    headers, email = await _account(client, "archive")
    created_set = await client.post("/api/v1/sets", headers=headers, json={"title": "Открытый"})
    set_id = created_set.json()["id"]
    await client.put(
        f"/api/v1/sets/{set_id}/cards",
        headers=headers,
        json={
            "cards": [
                {"term": f"Термин {index}", "definition": f"Ответ {index}"} for index in range(4)
            ]
        },
    )
    course = await client.post(
        "/api/v1/courses", headers=headers, json={"title": "Общий курс", "set_id": set_id}
    )
    course_id = course.json()["id"]
    published = await client.post(f"/api/v1/courses/{course_id}/publish", headers=headers, json={})
    assert published.status_code == 200
    await client.post(
        "/api/v1/auth/delete-account",
        headers=headers,
        json={
            "password": "Str0ngP@ss!",
            "confirmation": "УДАЛИТЬ",
            "public_content": "archive_public",
        },
    )

    async with get_session_factory()() as db:
        user = await db.scalar(select(User).where(User.email == email))
        assert user is not None
        user.deleted_at = datetime.now(UTC) - timedelta(days=31)
        await db.commit()
        with patch("app.services.account_deletion.get_object_storage") as storage:
            storage.return_value.delete_many = AsyncMock()
            await purge_due_accounts(db)
        await db.refresh(user)
        assert user.status is UserStatus.deleted
        assert user.email is None
        assert user.display_name == "Архив сообщества"
        archived = await db.get(Course, course_id)
        assert archived is not None
        assert archived.owner_id == user.id
