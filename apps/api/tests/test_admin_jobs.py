"""Фоновые операции в административной панели."""

from uuid import UUID, uuid4

from httpx import AsyncClient
from sqlalchemy import func, select

from app.db.session import get_session_factory
from app.models.admin_security import AdminAuditLog
from app.models.exports import AccountExportJob, AccountExportStatus
from app.models.imports import ImportJob, ImportJobStatus
from app.models.user import User, UserRole
from tests.test_admin import promote, verified_admin_headers
from tests.test_admin_user_management import mutation_headers
from tests.test_courses import auth


async def test_admin_lists_and_retries_safe_background_job(
    client: AsyncClient, monkeypatch
) -> None:
    suffix = uuid4().hex[:8]
    admin_username = f"coursejobs-admin-{suffix}"
    target_username = f"coursejobs-target-{suffix}"
    await auth(client, f"jobs-admin-{suffix}")
    target_headers = await auth(client, f"jobs-target-{suffix}")
    await promote(admin_username, UserRole.admin)
    created_set = await client.post(
        "/api/v1/sets", headers=target_headers, json={"title": "Набор для импорта"}
    )
    assert created_set.status_code == 201
    set_id = created_set.json()["id"]

    async with get_session_factory()() as db:
        target = await db.scalar(select(User).where(User.username == target_username))
        assert target is not None
        export = AccountExportJob(
            user_id=target.id,
            status=AccountExportStatus.failed,
            progress=5,
            error_message="Экспорт не завершён",
        )
        # Исходный ключ и имя импорта не должны попадать в административный контракт.
        import_job = ImportJob(
            user_id=target.id,
            set_id=UUID(set_id),
            filename="личный-файл.apkg",
            storage_key="private/imports/secret.apkg",
            status=ImportJobStatus.failed,
            error_message="Импорт не завершён",
        )
        db.add_all([export, import_job])
        await db.commit()
        export_id = export.id

    listed = await client.get(
        "/api/v1/admin/jobs?status=failed", headers=await verified_admin_headers(admin_username)
    )
    assert listed.status_code == 200, listed.text
    body = listed.json()
    assert body["total"] == 2
    assert {item["kind"] for item in body["items"]} == {"import", "export"}
    assert "storage_key" not in listed.text
    assert "личный-файл" not in listed.text
    assert next(item for item in body["items"] if item["kind"] == "export")["retryable"]
    assert not next(item for item in body["items"] if item["kind"] == "import")["retryable"]

    queued: list[tuple[str, str | None]] = []

    async def fake_enqueue(job_id: str, *, attempt: str | None = None) -> None:
        queued.append((job_id, attempt))

    monkeypatch.setattr("app.services.admin_jobs.enqueue_account_export", fake_enqueue)
    key = f"jobs-retry-{uuid4()}"
    headers = await mutation_headers(admin_username, key)
    retried = await client.post(
        f"/api/v1/admin/jobs/export/{export_id}/retry",
        headers=headers,
        json={"reason": "Повтор после проверки доступности worker"},
    )
    assert retried.status_code == 200, retried.text
    assert retried.json()["status"] == "queued"
    assert retried.json()["error"] is None
    assert queued and queued[0][0] == str(export_id)

    repeated = await client.post(
        f"/api/v1/admin/jobs/export/{export_id}/retry",
        headers=headers,
        json={"reason": "Повтор после проверки доступности worker"},
    )
    assert repeated.status_code == 200, repeated.text
    assert len(queued) == 1

    async with get_session_factory()() as db:
        audit_count = int(
            (
                await db.scalar(
                    select(func.count(AdminAuditLog.id)).where(
                        AdminAuditLog.action == "admin.jobs.retried",
                        AdminAuditLog.idempotency_key == key,
                    )
                )
            )
            or 0
        )
        assert audit_count == 1
