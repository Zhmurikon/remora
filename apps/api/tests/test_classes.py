"""Классы: роли не дают обойти изоляцию или повысить привилегии."""

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch

import pytest

from app.models.classes import ClassMemberRole
from app.services.class_permissions import ClassAction, allows


async def _auth(client: pytest.fixture, suffix: str) -> dict[str, str]:
    email = f"class-{suffix}@example.com"
    await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "Str0ngP@ss!", "username": f"class{suffix}"},
    )
    login = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": "Str0ngP@ss!"}
    )
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


def test_class_permission_matrix() -> None:
    assert allows(ClassMemberRole.teacher, ClassAction.view)
    assert allows(ClassMemberRole.teacher, ClassAction.edit_class)
    assert allows(ClassMemberRole.teacher, ClassAction.manage_members)
    assert allows(ClassMemberRole.assistant, ClassAction.manage_materials)
    assert allows(ClassMemberRole.assistant, ClassAction.manage_assignments)
    assert allows(ClassMemberRole.assistant, ClassAction.view_reports)
    assert not allows(ClassMemberRole.assistant, ClassAction.edit_class)
    assert not allows(ClassMemberRole.assistant, ClassAction.manage_members)
    assert allows(ClassMemberRole.student, ClassAction.view)
    assert not allows(ClassMemberRole.student, ClassAction.manage_materials)
    assert not allows(ClassMemberRole.student, ClassAction.manage_assignments)
    assert not allows(ClassMemberRole.student, ClassAction.view_reports)


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_class_roles_and_isolation(_mock_send: AsyncMock, client: pytest.fixture) -> None:
    owner = await _auth(client, "owner")
    assistant = await _auth(client, "assistant")
    student = await _auth(client, "student")
    stranger = await _auth(client, "stranger")

    created = await client.post(
        "/api/v1/classes",
        headers=owner,
        json={"title": "9Б — география", "requires_approval": True},
    )
    assert created.status_code == 201, created.text
    classroom = created.json()
    class_id = classroom["id"]
    assert classroom["my_role"] == "teacher"
    assert classroom["requires_approval"] is True
    assert len(classroom["join_code"]) == 8

    owner_detail = await client.get(f"/api/v1/classes/{class_id}", headers=owner)
    assert owner_detail.status_code == 200
    assert [member["role"] for member in owner_detail.json()["members"]] == ["teacher"]

    added_assistant = await client.post(
        f"/api/v1/classes/{class_id}/members",
        headers=owner,
        json={"username": "classassistant", "role": "assistant"},
    )
    assert added_assistant.status_code == 201, added_assistant.text
    added_student = await client.post(
        f"/api/v1/classes/{class_id}/members",
        headers=owner,
        json={"username": "classstudent", "role": "student"},
    )
    assert added_student.status_code == 201, added_student.text

    assistant_detail = await client.get(f"/api/v1/classes/{class_id}", headers=assistant)
    assert assistant_detail.status_code == 200
    assert assistant_detail.json()["my_role"] == "assistant"
    assert assistant_detail.json()["members"] == []
    assert (
        await client.patch(
            f"/api/v1/classes/{class_id}", headers=assistant, json={"title": "Нельзя"}
        )
    ).status_code == 403
    assert (
        await client.post(
            f"/api/v1/classes/{class_id}/members",
            headers=assistant,
            json={"username": "classstranger", "role": "student"},
        )
    ).status_code == 403

    student_detail = await client.get(f"/api/v1/classes/{class_id}", headers=student)
    assert student_detail.status_code == 200
    assert student_detail.json()["my_role"] == "student"
    assert student_detail.json()["members"] == []
    assert (
        await client.patch(f"/api/v1/classes/{class_id}", headers=student, json={"title": "Нельзя"})
    ).status_code == 403

    forbidden = await client.get(f"/api/v1/classes/{class_id}", headers=stranger)
    assert forbidden.status_code == 403
    assert forbidden.json()["code"] == "FORBIDDEN"

    mine = await client.get("/api/v1/classes", headers=student)
    assert mine.status_code == 200
    assert [item["id"] for item in mine.json()] == [class_id]


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_class_owner_can_update_own_class(
    _mock_send: AsyncMock, client: pytest.fixture
) -> None:
    owner = await _auth(client, "updater")
    created = await client.post("/api/v1/classes", headers=owner, json={"title": "До"})
    class_id = created.json()["id"]

    updated = await client.patch(
        f"/api/v1/classes/{class_id}",
        headers=owner,
        json={"title": "После", "description": "Описание", "requires_approval": True},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["title"] == "После"
    assert updated.json()["description"] == "Описание"
    assert updated.json()["requires_approval"] is True


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_join_share_private_set_and_assignment(
    _mock_send: AsyncMock, client: pytest.fixture
) -> None:
    owner = await _auth(client, "flowowner")
    student = await _auth(client, "flowstudent")
    second_student = await _auth(client, "flowsecond")
    material = await client.post(
        "/api/v1/sets",
        headers=owner,
        json={"title": "Столицы", "visibility": "private"},
    )
    assert material.status_code == 201
    set_id = material.json()["id"]
    assert (
        await client.put(
            f"/api/v1/sets/{set_id}/cards",
            headers=owner,
            json={"cards": [{"term": "Франция", "definition": "Париж"}]},
        )
    ).status_code == 200

    classroom = await client.post(
        "/api/v1/classes",
        headers=owner,
        json={"title": "География", "requires_approval": True},
    )
    class_id = classroom.json()["id"]
    original_code = classroom.json()["join_code"]
    invite = await client.get(f"/api/v1/classes/{class_id}/invite", headers=owner)
    assert invite.status_code == 200
    assert invite.json()["join_code"] == original_code
    assert invite.json()["join_url"].endswith(f"/classes/join?code={original_code}")

    joined = await client.post(
        "/api/v1/classes/join", headers=student, json={"join_code": original_code.lower()}
    )
    assert joined.status_code == 200
    assert joined.json()["status"] == "pending"
    assert (await client.get(f"/api/v1/classes/{class_id}", headers=student)).status_code == 403

    detail = await client.get(f"/api/v1/classes/{class_id}", headers=owner)
    pending = next(
        member for member in detail.json()["members"] if member["username"] == "classflowstudent"
    )
    approved = await client.post(
        f"/api/v1/classes/{class_id}/members/{pending['id']}/approve", headers=owner
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "active"

    cannot_assign = await client.post(
        f"/api/v1/classes/{class_id}/assignments",
        headers=owner,
        json={
            "set_id": set_id,
            "title": "Выучить столицы",
            "goal_type": "mastery_percent",
            "goal_value": 80,
        },
    )
    assert cannot_assign.status_code == 409
    shared = await client.post(
        f"/api/v1/classes/{class_id}/sets", headers=owner, json={"set_id": set_id}
    )
    assert shared.status_code == 201, shared.text
    assert shared.json()["set_id"] == set_id
    assert (
        await client.post(
            f"/api/v1/classes/{class_id}/sets", headers=student, json={"set_id": set_id}
        )
    ).status_code == 403

    # Приватный набор открывается активному ученику через общий учебный контур.
    assert (await client.get(f"/api/v1/sets/{set_id}", headers=student)).status_code == 200
    assert (
        await client.get(
            f"/api/v1/study/sets/{set_id}/queue", headers=student, params={"mode": "flashcards"}
        )
    ).status_code == 200

    opened_at = datetime.now(UTC) + timedelta(hours=1)
    due_at = opened_at + timedelta(days=3)
    assignment = await client.post(
        f"/api/v1/classes/{class_id}/assignments",
        headers=owner,
        json={
            "set_id": set_id,
            "title": "Выучить столицы",
            "mode_required": "learn",
            "goal_type": "mastery_percent",
            "goal_value": 80,
            "open_at": opened_at.isoformat(),
            "due_at": due_at.isoformat(),
        },
    )
    assert assignment.status_code == 201, assignment.text
    assert assignment.json()["goal_value"] == 80
    assert assignment.json()["mode_required"] == "learn"
    listed = await client.get(f"/api/v1/classes/{class_id}/assignments", headers=student)
    assert listed.status_code == 200
    assert [item["id"] for item in listed.json()] == [assignment.json()["id"]]

    rotated = await client.post(f"/api/v1/classes/{class_id}/invite/rotate", headers=owner)
    assert rotated.status_code == 200
    assert rotated.json()["join_code"] != original_code
    assert (
        await client.post(
            "/api/v1/classes/join", headers=second_student, json={"join_code": original_code}
        )
    ).status_code == 404
