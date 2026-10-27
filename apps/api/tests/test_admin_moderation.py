"""Административная очередь модерации и действия над публикациями."""

from uuid import uuid4

from httpx import AsyncClient
from pytest import MonkeyPatch
from sqlalchemy import func, select

from app.db.session import get_session_factory
from app.models.admin_security import AdminAuditLog
from app.models.user import UserRole
from tests.test_admin import promote, verified_admin_headers
from tests.test_admin_user_management import mutation_headers
from tests.test_courses import auth
from tests.test_moderation import publish_course


async def test_admin_moderates_report_and_publication(
    client: AsyncClient, monkeypatch: MonkeyPatch
) -> None:
    suffix = uuid4().hex[:8]
    admin_username = f"coursema-{suffix}"
    owner = await auth(client, f"mo-{suffix}")
    reporter = await auth(client, f"mr-{suffix}")
    await auth(client, f"ma-{suffix}")
    await promote(admin_username, UserRole.admin)
    course = await publish_course(client, owner, "Курс на проверку")
    report = await client.post(
        f"/api/v1/courses/public/{course['slug']}/report",
        headers=reporter,
        json={"reason": "misleading", "comment": "Неверные сведения в уроке"},
    )
    assert report.status_code == 201, report.text
    report_id = report.json()["id"]
    admin_headers = await verified_admin_headers(admin_username)

    queue = await client.get("/api/v1/admin/moderation/reports", headers=admin_headers)
    assert queue.status_code == 200, queue.text
    assert queue.json()["total"] == 1
    assert queue.json()["items"][0]["author_username"] == f"coursemo-{suffix}"

    publications = await client.get(
        "/api/v1/admin/moderation/courses?moderation_status=pending",
        headers=admin_headers,
    )
    assert publications.status_code == 200, publications.text
    assert publications.json()["items"][0]["reports_open"] == 1
    assert "Открытых жалоб: 1" in publications.json()["items"][0]["risk_signals"]

    denied = await client.post(
        f"/api/v1/admin/moderation/reports/{report_id}/resolve",
        headers=admin_headers,
        json={"outcome": "accepted", "reason": "Подтверждено при ручной проверке"},
    )
    assert denied.status_code == 403

    resolve_key = f"moderation-resolve-{uuid4()}"
    resolved = await client.post(
        f"/api/v1/admin/moderation/reports/{report_id}/resolve",
        headers=await mutation_headers(admin_username, resolve_key),
        json={"outcome": "accepted", "reason": "Подтверждено при ручной проверке"},
    )
    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["moderation_status"] == "blocked"
    assert resolved.json()["reports_open"] == 0
    assert resolved.json()["history"][0]["action"] == "admin.moderation.report_resolved"

    repeated = await client.post(
        f"/api/v1/admin/moderation/reports/{report_id}/resolve",
        headers=await mutation_headers(admin_username, resolve_key),
        json={"outcome": "accepted", "reason": "Подтверждено при ручной проверке"},
    )
    assert repeated.status_code == 200, repeated.text

    sent: list[tuple[str, str, str]] = []

    async def fake_warning(to: str, title: str, reason: str) -> None:
        sent.append((to, title, reason))

    monkeypatch.setattr(
        "app.services.admin_moderation.send_moderation_warning_email", fake_warning
    )
    warning = await client.post(
        f"/api/v1/admin/moderation/courses/{course['id']}/actions",
        headers=await mutation_headers(admin_username, f"moderation-warn-{uuid4()}"),
        json={"action": "warn", "reason": "Исправьте спорные формулировки в уроке"},
    )
    assert warning.status_code == 200, warning.text
    assert sent and sent[0][1] == "Курс на проверку"

    restored = await client.post(
        f"/api/v1/admin/moderation/courses/{course['id']}/actions",
        headers=await mutation_headers(admin_username, f"moderation-restore-{uuid4()}"),
        json={"action": "restore", "reason": "Автор исправил спорные формулировки"},
    )
    assert restored.status_code == 200, restored.text
    assert restored.json()["moderation_status"] == "ok"

    unpublished = await client.post(
        f"/api/v1/admin/moderation/courses/{course['id']}/actions",
        headers=await mutation_headers(admin_username, f"moderation-unpublish-{uuid4()}"),
        json={"action": "unpublish", "reason": "Публикация временно снята по просьбе автора"},
    )
    assert unpublished.status_code == 200, unpublished.text
    assert unpublished.json()["is_published"] is False
    assert (await client.get(f"/api/v1/courses/{course['id']}", headers=owner)).status_code == 200

    async with get_session_factory()() as db:
        audit_count = await db.scalar(
            select(func.count(AdminAuditLog.id)).where(
                AdminAuditLog.target_id == course["id"],
                AdminAuditLog.action.like("admin.moderation.%"),
            )
        )
        assert audit_count == 4
