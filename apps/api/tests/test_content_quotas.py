from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.core.errors import LimitExceededError
from app.db.session import get_session_factory
from app.models.billing import Entitlement, EntitlementSource
from app.models.content import SetVisibility, StudySet
from app.models.user import User
from app.services.entitlements import Entitlements


async def register(client: AsyncClient, suffix: str) -> tuple[dict[str, str], str]:
    email = f"quota-{suffix}@example.com"
    response = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "Str0ngP@ss!", "username": f"quota-{suffix}"},
    )
    assert response.status_code == 201
    login = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": "Str0ngP@ss!"}
    )
    return {"Authorization": f"Bearer {login.json()['access_token']}"}, email


async def set_limit(email: str, key: str, value: int) -> None:
    async with get_session_factory()() as db:
        user = await db.scalar(select(User).where(User.email == email))
        assert user is not None
        db.add(
            Entitlement(
                user_id=user.id,
                key=f"limit.{key}",
                value=value,
                source=EntitlementSource.admin,
                reason="Проверка квоты",
                starts_at=datetime.now(UTC) - timedelta(minutes=1),
            )
        )
        await db.commit()


async def test_archiving_set_frees_quota_and_restore_checks_it(client: AsyncClient) -> None:
    headers, email = await register(client, "sets")
    await set_limit(email, "sets.library_total", 1)

    first = await client.post("/api/v1/sets", headers=headers, json={"title": "Первый"})
    assert first.status_code == 201
    entitlements = await client.get("/api/v1/billing/entitlements", headers=headers)
    assert entitlements.json()["usage"]["sets.library_total"] == 1
    assert entitlements.json()["remaining"]["sets.library_total"] == 0
    blocked = await client.post("/api/v1/sets", headers=headers, json={"title": "Второй"})
    assert blocked.status_code == 402
    assert blocked.json()["code"] == "LIMIT_EXCEEDED"
    assert blocked.json()["details"] == {
        "limit_key": "sets.library_total",
        "limit": 1,
        "current": 1,
        "requested": 1,
        "resets_at": None,
        "upgrade_to": "plus",
    }

    deleted = await client.delete(f"/api/v1/sets/{first.json()['id']}", headers=headers)
    assert deleted.status_code == 204
    second = await client.post("/api/v1/sets", headers=headers, json={"title": "Второй"})
    assert second.status_code == 201
    restore = await client.post(
        f"/api/v1/sets/{first.json()['id']}/restore", headers=headers
    )
    assert restore.status_code == 402
    assert restore.json()["details"]["limit_key"] == "sets.library_total"


async def test_deleting_course_frees_course_quota(client: AsyncClient) -> None:
    headers, email = await register(client, "courses")
    await set_limit(email, "courses.total", 1)

    first = await client.post(
        "/api/v1/courses", headers=headers, json={"title": "Первый курс"}
    )
    assert first.status_code == 201
    blocked = await client.post(
        "/api/v1/courses", headers=headers, json={"title": "Второй курс"}
    )
    assert blocked.status_code == 402
    assert blocked.json()["details"]["limit_key"] == "courses.total"

    assert (
        await client.delete(f"/api/v1/courses/{first.json()['id']}", headers=headers)
    ).status_code == 204
    second = await client.post(
        "/api/v1/courses", headers=headers, json={"title": "Второй курс"}
    )
    assert second.status_code == 201


async def test_saved_snapshot_counts_only_new_unique_sets(client: AsyncClient) -> None:
    _, email = await register(client, "library")
    await set_limit(email, "sets.library_total", 1)
    first_id = uuid4()
    repeated_snapshot = {
        "articles": [
            {"set": {"id": str(first_id)}},
            {"set": {"id": str(first_id)}},
        ]
    }
    second_snapshot = {"articles": [{"set": {"id": str(uuid4())}}]}

    async with get_session_factory()() as db:
        user = await db.scalar(select(User).where(User.email == email))
        assert user is not None
        db.add(
            StudySet(
                id=first_id,
                owner_id=user.id,
                title="Занятое место",
                description="",
                visibility=SetVisibility.private,
                slug=f"quota-{first_id}",
                lang_term="ru",
                lang_definition="ru",
            )
        )
        await db.flush()
        entitlements = Entitlements(db)
        await entitlements.check_library_snapshot(user, repeated_snapshot)
        with pytest.raises(LimitExceededError) as raised:
            await entitlements.check_library_snapshot(user, second_snapshot)
        assert raised.value.details["current"] == 1
        assert raised.value.details["requested"] == 1
