"""Мягкая деградация сохраняет данные и обучение после окончания подписки."""

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy import select, update

from app.db.session import get_session_factory
from app.models.billing import (
    BillingInterval,
    Entitlement,
    EntitlementSource,
    Plan,
    Subscription,
    SubscriptionStatus,
)
from app.models.classes import Assignment
from app.models.user import User
from app.services.plans import sync_plan_catalog


async def _register(client: AsyncClient, suffix: str) -> tuple[dict[str, str], str]:
    email = f"degradation-{suffix}@example.com"
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "Str0ngP@ss!",
            "username": f"degradation-{suffix}",
        },
    )
    assert response.status_code == 201
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "Str0ngP@ss!"},
    )
    return {"Authorization": f"Bearer {login.json()['access_token']}"}, email


async def _start_plus(email: str) -> None:
    now = datetime.now(UTC)
    async with get_session_factory()() as db:
        await sync_plan_catalog(db)
        user = await db.scalar(select(User).where(User.email == email))
        plan = await db.scalar(select(Plan).where(Plan.code == "plus", Plan.active.is_(True)))
        assert user is not None and plan is not None
        db.add(
            Subscription(
                user_id=user.id,
                plan_id=plan.id,
                status=SubscriptionStatus.active,
                interval=BillingInterval.month,
                current_period_start=now - timedelta(days=1),
                current_period_end=now + timedelta(days=30),
            )
        )
        await db.commit()


async def _expire_subscription(email: str) -> None:
    now = datetime.now(UTC)
    async with get_session_factory()() as db:
        user = await db.scalar(select(User).where(User.email == email))
        assert user is not None
        await db.execute(
            update(Subscription)
            .where(Subscription.user_id == user.id)
            .values(
                status=SubscriptionStatus.expired,
                current_period_end=now - timedelta(minutes=1),
                ended_at=now - timedelta(minutes=1),
            )
        )
        await db.commit()


async def _set_limit(email: str, key: str, value: int) -> None:
    async with get_session_factory()() as db:
        user = await db.scalar(select(User).where(User.email == email))
        assert user is not None
        db.add(
            Entitlement(
                user_id=user.id,
                key=f"limit.{key}",
                value=value,
                source=EntitlementSource.admin,
                reason="Проверка тарифного лимита",
                starts_at=datetime.now(UTC) - timedelta(minutes=1),
            )
        )
        await db.commit()


@pytest.fixture(autouse=True)
def _disable_verification_email() -> Iterator[AsyncMock]:
    with patch("app.services.auth.send_verification_email", new_callable=AsyncMock) as mocked:
        yield mocked


async def test_expired_subscription_keeps_content_and_learning(client: AsyncClient) -> None:
    headers, email = await _register(client, "content")
    await _start_plus(email)

    set_ids: list[str] = []
    for index in range(21):
        created = await client.post(
            "/api/v1/sets", headers=headers, json={"title": f"Набор {index + 1}"}
        )
        assert created.status_code == 201, created.text
        set_ids.append(created.json()["id"])
    cards = await client.put(
        f"/api/v1/sets/{set_ids[-1]}/cards",
        headers=headers,
        json={"cards": [{"term": "Вопрос", "definition": "Ответ"}]},
    )
    assert cards.status_code == 200, cards.text

    await _expire_subscription(email)

    entitlements = await client.get("/api/v1/billing/entitlements", headers=headers)
    assert entitlements.status_code == 200
    assert entitlements.json()["plan_code"] == "free"
    assert entitlements.json()["usage"]["sets.library_total"] == 21
    assert entitlements.json()["remaining"]["sets.library_total"] == 0
    assert len((await client.get("/api/v1/sets", headers=headers)).json()) == 21
    queue = await client.get(
        f"/api/v1/study/sets/{set_ids[-1]}/queue",
        headers=headers,
        params={"mode": "flashcards"},
    )
    assert queue.status_code == 200, queue.text
    blocked = await client.post(
        "/api/v1/sets", headers=headers, json={"title": "Лишний набор"}
    )
    assert blocked.status_code == 402
    assert blocked.json()["details"]["limit_key"] == "sets.library_total"


async def test_expired_subscription_makes_extra_class_read_only(client: AsyncClient) -> None:
    owner, email = await _register(client, "teacher")
    student, _ = await _register(client, "student")
    await _start_plus(email)

    first = await client.post("/api/v1/classes", headers=owner, json={"title": "Первый"})
    second = await client.post("/api/v1/classes", headers=owner, json={"title": "Второй"})
    assert first.status_code == second.status_code == 201
    class_id = second.json()["id"]
    material = await client.post(
        "/api/v1/sets", headers=owner, json={"title": "Материал класса"}
    )
    set_id = material.json()["id"]
    assert (
        await client.put(
            f"/api/v1/sets/{set_id}/cards",
            headers=owner,
            json={"cards": [{"term": "Термин", "definition": "Определение"}]},
        )
    ).status_code == 200
    assert (
        await client.post(
            f"/api/v1/classes/{class_id}/sets", headers=owner, json={"set_id": set_id}
        )
    ).status_code == 201
    joined = await client.post(
        "/api/v1/classes/join",
        headers=student,
        json={"join_code": second.json()["join_code"]},
    )
    assert joined.status_code == 200
    existing = await client.post(
        f"/api/v1/classes/{class_id}/assignments",
        headers=owner,
        json={
            "set_id": set_id,
            "title": "Существующее задание",
            "goal_type": "cards_count",
            "goal_value": 1,
        },
    )
    assert existing.status_code == 201, existing.text

    await _expire_subscription(email)

    detail = await client.get(f"/api/v1/classes/{class_id}", headers=owner)
    assert detail.status_code == 200
    assert detail.json()["is_read_only"] is True
    assert detail.json()["can_create_assignments"] is False
    first_detail = await client.get(f"/api/v1/classes/{first.json()['id']}", headers=owner)
    assert first_detail.status_code == 200
    assert first_detail.json()["is_read_only"] is False
    assert first_detail.json()["can_create_assignments"] is True
    assert (
        await client.get(f"/api/v1/classes/{class_id}/reports", headers=owner)
    ).status_code == 200
    student_assignments = await client.get(
        f"/api/v1/classes/{class_id}/assignments", headers=student
    )
    assert student_assignments.status_code == 200
    assert [item["id"] for item in student_assignments.json()] == [existing.json()["id"]]
    assert (
        await client.get(
            f"/api/v1/study/sets/{set_id}/queue",
            headers=student,
            params={"mode": "flashcards"},
        )
    ).status_code == 200

    blocked_assignment = await client.post(
        f"/api/v1/classes/{class_id}/assignments",
        headers=owner,
        json={
            "set_id": set_id,
            "title": "Новое задание",
            "goal_type": "cards_count",
            "goal_value": 1,
        },
    )
    assert blocked_assignment.status_code == 402
    assert blocked_assignment.json()["details"]["limit_key"] == "classes.max"
    blocked_material = await client.post(
        f"/api/v1/classes/{class_id}/sets", headers=owner, json={"set_id": set_id}
    )
    assert blocked_material.status_code == 402
    assert blocked_material.json()["details"]["limit_key"] == "classes.max"
    blocked_class = await client.post(
        "/api/v1/classes", headers=owner, json={"title": "Третий"}
    )
    assert blocked_class.status_code == 402
    assert blocked_class.json()["details"]["limit_key"] == "classes.max"


async def test_class_student_and_active_assignment_limits(client: AsyncClient) -> None:
    owner, email = await _register(client, "limits")
    first_student, _ = await _register(client, "limits-student-1")
    second_student, _ = await _register(client, "limits-student-2")
    await _set_limit(email, "classes.students_max", 1)
    await _set_limit(email, "assignments.active_max", 1)

    classroom = await client.post(
        "/api/v1/classes", headers=owner, json={"title": "Лимитный класс"}
    )
    class_id = classroom.json()["id"]
    join_code = classroom.json()["join_code"]
    assert (
        await client.post(
            "/api/v1/classes/join", headers=first_student, json={"join_code": join_code}
        )
    ).status_code == 200
    blocked_student = await client.post(
        "/api/v1/classes/join", headers=second_student, json={"join_code": join_code}
    )
    assert blocked_student.status_code == 402
    assert blocked_student.json()["details"]["limit_key"] == "classes.students_max"

    material = await client.post(
        "/api/v1/sets", headers=owner, json={"title": "Набор для заданий"}
    )
    set_id = material.json()["id"]
    assert (
        await client.post(
            f"/api/v1/classes/{class_id}/sets", headers=owner, json={"set_id": set_id}
        )
    ).status_code == 201
    assignment_body = {
        "set_id": set_id,
        "title": "Активное задание",
        "goal_type": "cards_count",
        "goal_value": 1,
    }
    assert (
        await client.post(
            f"/api/v1/classes/{class_id}/assignments",
            headers=owner,
            json=assignment_body,
        )
    ).status_code == 201
    blocked_assignment = await client.post(
        f"/api/v1/classes/{class_id}/assignments",
        headers=owner,
        json={**assignment_body, "title": "Ещё одно задание"},
    )
    assert blocked_assignment.status_code == 402
    assert blocked_assignment.json()["details"]["limit_key"] == "assignments.active_max"

    async with get_session_factory()() as db:
        await db.execute(
            update(Assignment)
            .where(Assignment.class_id == classroom.json()["id"])
            .values(due_at=datetime.now(UTC) - timedelta(minutes=1))
        )
        await db.commit()
    replacement = await client.post(
        f"/api/v1/classes/{class_id}/assignments",
        headers=owner,
        json={**assignment_body, "title": "Задание после дедлайна"},
    )
    assert replacement.status_code == 201, replacement.text
