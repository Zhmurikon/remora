"""Изменяющие операции администратора над пользователями."""

from uuid import uuid4

from httpx import AsyncClient
from sqlalchemy import func, select

from app.core.security import create_jwt
from app.db.session import get_session_factory
from app.models.admin_security import AdminAuditLog
from app.models.user import User, UserRole
from tests.test_admin import promote, verified_admin_headers
from tests.test_courses import auth


async def mutation_headers(username: str, idempotency_key: str) -> dict[str, str]:
    headers = await verified_admin_headers(username)
    async with get_session_factory()() as db:
        user = await db.scalar(select(User).where(User.username == username))
        assert user is not None
        headers.update(
            {
                "X-Admin-Confirmation": create_jwt(str(user.id), "admin_confirmation"),
                "Idempotency-Key": idempotency_key,
            }
        )
    return headers


async def test_admin_manages_role_status_and_entitlements(client: AsyncClient) -> None:
    suffix = uuid4().hex[:8]
    owner_username = f"coursemanagement-owner-{suffix}"
    target_username = f"coursemanagement-target-{suffix}"
    await auth(client, f"management-owner-{suffix}")
    await promote(owner_username, UserRole.admin)
    target_access = await auth(client, f"management-target-{suffix}")

    async with get_session_factory()() as db:
        target = await db.scalar(select(User).where(User.username == target_username))
        assert target is not None
        target_id = target.id

    unconfirmed = await client.patch(
        f"/api/v1/admin/users/{target_id}/role",
        headers=await verified_admin_headers(owner_username),
        json={"role": "teacher", "reason": "Назначение преподавателем"},
    )
    assert unconfirmed.status_code == 403

    role_key = f"role-{uuid4()}"
    headers = await mutation_headers(owner_username, role_key)
    changed_role = await client.patch(
        f"/api/v1/admin/users/{target_id}/role",
        headers=headers,
        json={"role": "teacher", "reason": "Назначение преподавателем"},
    )
    assert changed_role.status_code == 200, changed_role.text
    assert changed_role.json()["role"] == "teacher"

    repeated = await client.patch(
        f"/api/v1/admin/users/{target_id}/role",
        headers=headers,
        json={"role": "teacher", "reason": "Назначение преподавателем"},
    )
    assert repeated.status_code == 200
    conflict = await client.patch(
        f"/api/v1/admin/users/{target_id}/role",
        headers=headers,
        json={"role": "moderator", "reason": "Другая операция с тем же ключом"},
    )
    assert conflict.status_code == 409

    suspended = await client.patch(
        f"/api/v1/admin/users/{target_id}/status",
        headers=await mutation_headers(owner_username, f"suspend-{uuid4()}"),
        json={"status": "suspended", "reason": "Проверка приостановки аккаунта"},
    )
    assert suspended.status_code == 200, suspended.text
    assert suspended.json()["status"] == "suspended"
    assert (await client.get("/api/v1/auth/me", headers=target_access)).status_code == 401

    restored = await client.patch(
        f"/api/v1/admin/users/{target_id}/status",
        headers=await mutation_headers(owner_username, f"restore-{uuid4()}"),
        json={"status": "active", "reason": "Проверка завершена, доступ восстановлен"},
    )
    assert restored.status_code == 200
    assert restored.json()["status"] == "active"

    granted = await client.post(
        f"/api/v1/admin/users/{target_id}/entitlements",
        headers=await mutation_headers(owner_username, f"grant-{uuid4()}"),
        json={
            "key": "limit.ai.generation_tokens_per_week",
            "value": 750000,
            "valid_until": None,
            "reason": "Индивидуальная квота для проверки",
        },
    )
    assert granted.status_code == 200, granted.text
    override = granted.json()["access"]["overrides"][0]
    assert override["value"] == 750000
    assert override["revocable"] is True
    assert granted.json()["access"]["limits"]["ai.generation_tokens_per_week"] == 750000

    revoked = await client.request(
        "DELETE",
        f"/api/v1/admin/users/{target_id}/entitlements/{override['id']}",
        headers=await mutation_headers(owner_username, f"revoke-{uuid4()}"),
        json={"reason": "Индивидуальная квота больше не требуется"},
    )
    assert revoked.status_code == 200, revoked.text
    assert revoked.json()["access"]["overrides"] == []

    async with get_session_factory()() as db:
        role_audits = await db.scalar(
            select(func.count(AdminAuditLog.id)).where(
                AdminAuditLog.action == "admin.user.role_changed",
                AdminAuditLog.target_id == target_id,
            )
        )
        assert role_audits == 1


async def test_admin_cannot_change_self_or_grant_unknown_entitlement(
    client: AsyncClient,
) -> None:
    suffix = uuid4().hex[:8]
    owner_username = f"coursemanagement-self-{suffix}"
    await auth(client, f"management-self-{suffix}")
    await promote(owner_username, UserRole.admin)
    async with get_session_factory()() as db:
        owner = await db.scalar(select(User).where(User.username == owner_username))
        assert owner is not None
        owner_id = owner.id

    self_change = await client.patch(
        f"/api/v1/admin/users/{owner_id}/role",
        headers=await mutation_headers(owner_username, f"self-{uuid4()}"),
        json={"role": "user", "reason": "Попытка снять собственную роль"},
    )
    assert self_change.status_code == 403

    unknown = await client.post(
        f"/api/v1/admin/users/{owner_id}/entitlements",
        headers=await mutation_headers(owner_username, f"unknown-{uuid4()}"),
        json={
            "key": "limit.unknown",
            "value": 1,
            "reason": "Проверка неизвестного тарифного права",
        },
    )
    assert unknown.status_code == 422
