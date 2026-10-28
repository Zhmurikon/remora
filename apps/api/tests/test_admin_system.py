"""Состояние системы, фиче-флаги и журнал инцидентов."""

from datetime import UTC, datetime
from uuid import uuid4

from httpx import AsyncClient
from sqlalchemy import func, select

from app.db.session import get_session_factory
from app.models.admin_operations import AdminIncident, FeatureFlag
from app.models.admin_security import AdminAuditLog
from app.models.user import UserRole
from app.schemas.admin_system import AdminSystemCheck
from tests.test_admin import promote, verified_admin_headers
from tests.test_admin_user_management import mutation_headers
from tests.test_courses import auth


async def test_admin_manages_flags_and_incident_journal(client: AsyncClient, monkeypatch) -> None:
    suffix = uuid4().hex[:8]
    admin_username = f"coursesystem-admin-{suffix}"
    await auth(client, f"system-admin-{suffix}")
    await promote(admin_username, UserRole.admin)

    async def fake_checks(_self, checked_at: datetime) -> list[AdminSystemCheck]:
        return [
            AdminSystemCheck(
                key="postgres",
                label="PostgreSQL",
                group="Основа",
                state="ok",
                detail="Подключение установлено",
                checked_at=checked_at,
            )
        ]

    monkeypatch.setattr("app.services.admin_system.AdminSystemService.checks", fake_checks)
    regular = await auth(client, f"system-regular-{suffix}")
    assert (await client.get("/api/v1/admin/system", headers=regular)).status_code == 403

    overview = await client.get(
        "/api/v1/admin/system", headers=await verified_admin_headers(admin_username)
    )
    assert overview.status_code == 200, overview.text
    assert overview.json()["checks"][0]["state"] == "ok"

    flag_key = f"catalog.preview.{suffix}"
    flag_body = {
        "key": flag_key,
        "description": "Предпросмотр новой выдачи каталога",
        "enabled": True,
        "environment": "local",
        "owner": "Команда продукта",
        "expires_at": None,
        "reason": "Включение для локальной приёмки раздела",
    }
    flag_idempotency = f"system-flag-{uuid4()}"
    flag_headers = await mutation_headers(admin_username, flag_idempotency)
    flag = await client.put("/api/v1/admin/system/flags", headers=flag_headers, json=flag_body)
    assert flag.status_code == 200, flag.text
    assert flag.json()["effective"] is True
    repeated_flag = await client.put(
        "/api/v1/admin/system/flags", headers=flag_headers, json=flag_body
    )
    assert repeated_flag.status_code == 200
    assert repeated_flag.json()["id"] == flag.json()["id"]

    incident_headers = await mutation_headers(admin_username, f"system-incident-{uuid4()}")
    incident = await client.post(
        "/api/v1/admin/system/incidents",
        headers=incident_headers,
        json={
            "title": "Задержка обработки очереди",
            "summary": "Worker не обрабатывал экспорт в ожидаемое время.",
            "severity": "medium",
            "external_url": "https://monitoring.example.com/incidents/1",
            "started_at": datetime.now(UTC).isoformat(),
            "reason": "Фиксация подтверждённого операционного инцидента",
        },
    )
    assert incident.status_code == 200, incident.text
    incident_id = incident.json()["id"]
    resolved = await client.patch(
        f"/api/v1/admin/system/incidents/{incident_id}",
        headers=await mutation_headers(admin_username, f"system-resolve-{uuid4()}"),
        json={
            "summary": "Worker восстановлен, очередь обработана без потери данных.",
            "severity": "medium",
            "status": "resolved",
            "external_url": "https://monitoring.example.com/incidents/1",
            "reason": "Закрытие после проверки очереди и результатов обработки",
        },
    )
    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["status"] == "resolved"
    assert resolved.json()["resolved_at"] is not None

    final_overview = await client.get(
        "/api/v1/admin/system", headers=await verified_admin_headers(admin_username)
    )
    assert final_overview.status_code == 200
    assert any(item["key"] == flag_key for item in final_overview.json()["flags"])
    assert any(item["id"] == incident_id for item in final_overview.json()["incidents"])

    async with get_session_factory()() as db:
        assert await db.scalar(select(func.count(FeatureFlag.id))) == 1
        assert await db.scalar(select(func.count(AdminIncident.id))) == 1
        assert (
            await db.scalar(
                select(func.count(AdminAuditLog.id)).where(
                    AdminAuditLog.action.in_(
                        [
                            "admin.system.flag_saved",
                            "admin.system.incident_created",
                            "admin.system.incident_updated",
                        ]
                    )
                )
            )
            == 3
        )
