"""Заголовки, аномальная регистрация и лимиты тяжёлых операций."""

from unittest.mock import AsyncMock, patch

from httpx import AsyncClient

from app.core.config import get_settings
from tests.test_study import _auth, _set_with_cards


async def test_api_security_headers_and_sensitive_cache(client: AsyncClient) -> None:
    response = await client.get("/api/v1/auth/me")
    assert response.headers["content-security-policy"].startswith("default-src 'none'")
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["cache-control"] == "no-store"
    assert "strict-transport-security" not in response.headers


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_registration_requires_captcha_only_after_anomaly(
    _mock_send: AsyncMock, client: AsyncClient
) -> None:
    settings = get_settings()
    with patch(
        "app.api.v1.auth.enforce_rate_limit", return_value=settings.captcha_anomaly_threshold
    ):
        regular = await client.post(
            "/api/v1/auth/register",
            json={
                "email": "normal-captcha@example.com",
                "password": "Str0ngP@ss!",
                "username": "normal-captcha",
            },
        )
    assert regular.status_code == 201

    with patch(
        "app.api.v1.auth.enforce_rate_limit",
        return_value=settings.captcha_anomaly_threshold + 1,
    ):
        challenged = await client.post(
            "/api/v1/auth/register",
            json={
                "email": "anomaly-captcha@example.com",
                "password": "Str0ngP@ss!",
                "username": "anomaly-captcha",
            },
        )
    assert challenged.status_code == 403
    assert challenged.json()["code"] == "CAPTCHA_REQUIRED"


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_mass_export_uses_account_and_ip_limit(
    _mock_send: AsyncMock, client: AsyncClient
) -> None:
    headers = await _auth(client, "mass-limit")
    study_set = await _set_with_cards(client, headers, count=1)
    with patch("app.api.v1.deps.enforce_rate_limit", new_callable=AsyncMock) as limited:
        response = await client.get(
            f"/api/v1/sets/{study_set['id']}/export?format=txt", headers=headers
        )
    assert response.status_code == 200
    kwargs = limited.await_args.kwargs
    assert kwargs["scope"] == "mass:set-export"
    assert kwargs["ip"]
    assert kwargs["identity"]
