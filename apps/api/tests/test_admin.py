"""Административный периметр, TOTP и управление пользователями."""

from unittest.mock import patch

from httpx import AsyncClient
from sqlalchemy import select, update

from app.core.config import get_settings
from app.core.totp import totp_code, totp_step
from app.db.session import get_session_factory
from app.models.admin import AdminSecondFactor
from app.models.user import User, UserRole
from tests.test_courses import auth


async def _admin(client: AsyncClient, suffix: str = "panel") -> tuple[dict[str, str], list[str]]:
    headers = await auth(client, suffix)
    async with get_session_factory()() as db:
        await db.execute(
            update(User).where(User.username == f"course{suffix}").values(role=UserRole.admin)
        )
        await db.commit()
    setup = await client.post(
        "/api/v1/admin/2fa/setup", headers=headers, json={"password": "Str0ngP@ss!"}
    )
    assert setup.status_code == 200, setup.text
    code = totp_code(setup.json()["secret"], totp_step())
    enabled = await client.post(
        "/api/v1/admin/2fa/enable",
        headers=headers,
        json={"code": code},
    )
    assert enabled.status_code == 200, enabled.text
    replayed = await client.post(
        "/api/v1/admin/2fa/challenge", headers=headers, json={"code": code}
    )
    assert replayed.status_code == 403
    return {**headers, "X-Admin-Session": enabled.json()["admin_token"]}, enabled.json()[
        "recovery_codes"
    ]


async def test_admin_requires_role_2fa_and_short_lived_session(client: AsyncClient) -> None:
    regular = await auth(client, "regular-admin")
    assert (await client.get("/api/v1/admin/2fa/status", headers=regular)).status_code == 403

    admin, recovery = await _admin(client)
    access_only = {"Authorization": admin["Authorization"]}
    denied = await client.get("/api/v1/admin/dashboard", headers=access_only)
    assert denied.status_code == 403
    assert denied.json()["code"] == "FORBIDDEN"
    assert (await client.get("/api/v1/admin/dashboard", headers=admin)).status_code == 200

    challenge = await client.post(
        "/api/v1/admin/2fa/challenge", headers=access_only, json={"code": recovery[0]}
    )
    assert challenge.status_code == 200
    reused = await client.post(
        "/api/v1/admin/2fa/challenge", headers=access_only, json={"code": recovery[0]}
    )
    assert reused.status_code == 403

    async with get_session_factory()() as db:
        factor = await db.scalar(select(AdminSecondFactor))
        assert factor is not None
        assert "JBSWY" not in factor.secret_encrypted
        assert factor.enabled_at is not None


async def test_admin_can_manage_other_user_but_not_lock_self_out(client: AsyncClient) -> None:
    admin, _ = await _admin(client, "manager")
    target = await auth(client, "managed")
    target_user = (await client.get("/api/v1/auth/me", headers=target)).json()
    updated = await client.patch(
        f"/api/v1/admin/users/{target_user['id']}",
        headers=admin,
        json={"role": "moderator", "status": "suspended", "reason": "Проверка управления"},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["role"] == "moderator"
    assert updated.json()["status"] == "suspended"
    assert (await client.get("/api/v1/auth/me", headers=target)).status_code == 401

    me = (await client.get("/api/v1/auth/me", headers=admin)).json()
    denied = await client.patch(
        f"/api/v1/admin/users/{me['id']}",
        headers=admin,
        json={"role": "user", "reason": "Снять права самому себе"},
    )
    assert denied.status_code == 403
    assert (await client.get("/api/v1/admin/users", headers=admin)).status_code == 200
    assert (await client.get("/api/v1/admin/tasks", headers=admin)).status_code == 200


async def test_non_local_admin_perimeter_checks_host_and_ip(client: AsyncClient) -> None:
    admin, _ = await _admin(client, "perimeter")
    settings = get_settings().model_copy(
        update={
            "environment": "production",
            "admin_host": "admin.remora.test",
            "admin_ip_allowlist": ["127.0.0.1/32"],
        }
    )
    with patch("app.api.v1.deps.get_settings", return_value=settings):
        wrong_host = await client.get("/api/v1/admin/dashboard", headers=admin)
        assert wrong_host.status_code == 403
        allowed = await client.get(
            "/api/v1/admin/dashboard", headers={**admin, "Host": "admin.remora.test"}
        )
        assert allowed.status_code == 200
