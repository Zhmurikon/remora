"""Классы: роли не дают обойти изоляцию или повысить привилегии."""

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
