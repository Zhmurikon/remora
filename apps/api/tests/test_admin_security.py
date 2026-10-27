"""Отдельный административный вход, 2FA и аудит."""

from httpx import AsyncClient

from app.core.totp import totp_code
from app.models.user import UserRole
from tests.test_admin import promote
from tests.test_courses import auth


async def test_admin_requires_and_completes_two_factor_login(client: AsyncClient) -> None:
    suffix = "security-owner"
    ordinary_headers = await auth(client, suffix)
    await promote(f"course{suffix}", UserRole.admin)

    ordinary_access = await client.get("/api/v1/admin/overview", headers=ordinary_headers)
    assert ordinary_access.status_code == 403

    credentials = {
        "email": f"course-{suffix}@example.com",
        "password": "Str0ngP@ss!",
    }
    login = await client.post("/api/v1/admin/auth/login", json=credentials)
    assert login.status_code == 200, login.text
    assert login.json()["step"] == "setup_required"

    setup = await client.post(
        "/api/v1/admin/auth/2fa/setup",
        json={"token": login.json()["token"]},
    )
    assert setup.status_code == 200, setup.text
    secret = setup.json()["secret"]
    assert setup.json()["provisioning_uri"].startswith("otpauth://totp/")

    enabled = await client.post(
        "/api/v1/admin/auth/2fa/enable",
        json={"token": login.json()["token"], "code": totp_code(secret)},
    )
    assert enabled.status_code == 200, enabled.text
    assert len(enabled.json()["recovery_codes"]) == 8
    headers = {"Authorization": f"Bearer {enabled.json()['access_token']}"}

    assert (await client.get("/api/v1/admin/overview", headers=headers)).status_code == 200
    status = await client.get("/api/v1/admin/security/status", headers=headers)
    assert status.status_code == 200
    assert status.json()["enabled"] is True
    assert status.json()["recovery_codes_remaining"] == 8

    confirmation = await client.post(
        "/api/v1/admin/security/confirm",
        headers=headers,
        json={"code": totp_code(secret)},
    )
    assert confirmation.status_code == 200, confirmation.text
    assert confirmation.json()["confirmation_token"]

    audit = await client.get("/api/v1/admin/security/audit", headers=headers)
    assert audit.status_code == 200, audit.text
    assert audit.json()["total"] >= 3
    assert {item["action"] for item in audit.json()["items"]} >= {
        "admin.login.password",
        "admin.2fa.enabled",
        "admin.confirmation",
    }

    next_login = await client.post("/api/v1/admin/auth/login", json=credentials)
    assert next_login.status_code == 200
    assert next_login.json()["step"] == "challenge_required"
    verified = await client.post(
        "/api/v1/admin/auth/2fa/verify",
        json={"token": next_login.json()["token"], "code": totp_code(secret)},
    )
    assert verified.status_code == 200, verified.text
    assert verified.json()["recovery_codes"] == []


async def test_admin_recovery_code_is_one_time(client: AsyncClient) -> None:
    suffix = "security-recovery"
    await auth(client, suffix)
    await promote(f"course{suffix}", UserRole.admin)
    credentials = {
        "email": f"course-{suffix}@example.com",
        "password": "Str0ngP@ss!",
    }
    login = (await client.post("/api/v1/admin/auth/login", json=credentials)).json()
    setup = (
        await client.post("/api/v1/admin/auth/2fa/setup", json={"token": login["token"]})
    ).json()
    enabled = (
        await client.post(
            "/api/v1/admin/auth/2fa/enable",
            json={"token": login["token"], "code": totp_code(setup["secret"])},
        )
    ).json()
    recovery_code = enabled["recovery_codes"][0]

    challenge = (await client.post("/api/v1/admin/auth/login", json=credentials)).json()
    first = await client.post(
        "/api/v1/admin/auth/2fa/verify",
        json={"token": challenge["token"], "code": recovery_code},
    )
    assert first.status_code == 200, first.text

    challenge = (await client.post("/api/v1/admin/auth/login", json=credentials)).json()
    second = await client.post(
        "/api/v1/admin/auth/2fa/verify",
        json={"token": challenge["token"], "code": recovery_code},
    )
    assert second.status_code == 401
