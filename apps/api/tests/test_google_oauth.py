"""Google OAuth: state, создание пользователя и сращивание по подтверждённой почте."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
from pydantic import SecretStr
from sqlalchemy import text

from app.core.config import get_settings
from app.db.session import get_engine
from app.services import google_oauth
from app.services.google_oauth import GoogleProfile

pytestmark = pytest.mark.asyncio


def _enable_google(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "google_oauth_client_id", "test-client")
    monkeypatch.setattr(settings, "google_oauth_client_secret", SecretStr("test-secret"))


class _FakeGoogleClient:
    def __init__(self, *, timeout: httpx.Timeout) -> None:
        self.timeout = timeout

    async def __aenter__(self) -> _FakeGoogleClient:
        return self

    async def __aexit__(self, *args: object) -> None:
        return None

    async def post(self, url: str, *, data: dict[str, str]) -> httpx.Response:
        assert url == google_oauth.GOOGLE_TOKEN_ENDPOINT
        assert data["client_secret"] == "test-secret"
        return httpx.Response(
            200,
            json={"access_token": "google-access"},
            request=httpx.Request("POST", url),
        )

    async def get(self, url: str, *, headers: dict[str, str]) -> httpx.Response:
        assert url == google_oauth.GOOGLE_USERINFO_ENDPOINT
        assert headers == {"Authorization": "Bearer google-access"}
        return httpx.Response(
            200,
            json={
                "sub": "google-provider-789",
                "email": "Provider@Gmail.com",
                "email_verified": True,
                "name": "Пользователь Google",
            },
            request=httpx.Request("GET", url),
        )


async def _start(client: pytest.fixture, *, next_url: str | None = None) -> tuple[str, str]:
    params = {"next": next_url} if next_url else None
    response = await client.get("/api/v1/auth/oauth/google/start", params=params)
    assert response.status_code == 307
    location = response.headers["location"]
    state = parse_qs(urlparse(location).query)["state"][0]
    state_cookie = response.cookies.get("remora_oauth_state")
    assert state_cookie is not None
    assert "HttpOnly" in response.headers["set-cookie"]
    return state, state_cookie


async def test_google_provider_exchanges_code_for_verified_profile(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _enable_google(monkeypatch)
    monkeypatch.setattr(google_oauth.httpx, "AsyncClient", _FakeGoogleClient)

    profile = await google_oauth.exchange_code("authorization-code")

    assert profile.subject == "google-provider-789"
    assert profile.email == "provider@gmail.com"
    assert profile.email_verified is True
    assert profile.email_authoritative is True


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
@patch("app.api.v1.auth.google_oauth.exchange_code", new_callable=AsyncMock)
async def test_google_oauth_merges_existing_user_by_verified_email(
    mock_exchange: AsyncMock,
    mock_email: AsyncMock,
    client: pytest.fixture,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _enable_google(monkeypatch)
    registered = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "Merge@Gmail.com",
            "password": "Str0ngP@ss!",
            "username": "mergeuser",
        },
    )
    user_id = registered.json()["user"]["id"]
    mock_exchange.return_value = GoogleProfile(
        subject="google-merge-123",
        email="merge@gmail.com",
        email_verified=True,
        email_authoritative=True,
        name="Имя из Google",
        picture="https://example.com/avatar.jpg",
        raw={
            "sub": "google-merge-123",
            "email": "merge@gmail.com",
            "email_verified": True,
        },
    )

    state, _cookie = await _start(client, next_url="/app/sets")
    callback = await client.get(
        "/api/v1/auth/oauth/google/callback",
        params={"state": state, "code": "one-time-code"},
    )

    assert callback.status_code == 303
    assert callback.headers["location"] == "http://localhost:5173/app/sets"
    assert callback.cookies.get("remora_refresh") is not None
    mock_exchange.assert_awaited_once_with("one-time-code")

    async with get_engine().connect() as connection:
        users_count = await connection.scalar(text("SELECT count(*) FROM users"))
        linked_user_id = await connection.scalar(
            text(
                "SELECT user_id FROM oauth_accounts "
                "WHERE provider = 'google' AND provider_user_id = 'google-merge-123'"
            )
        )
        verified = await connection.scalar(
            text("SELECT email_verified_at IS NOT NULL FROM users WHERE id = :id"),
            {"id": user_id},
        )

    assert users_count == 1
    assert str(linked_user_id) == user_id
    assert verified is True


@patch("app.api.v1.auth.google_oauth.exchange_code", new_callable=AsyncMock)
async def test_google_oauth_creates_new_user(
    mock_exchange: AsyncMock,
    client: pytest.fixture,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _enable_google(monkeypatch)
    mock_exchange.return_value = GoogleProfile(
        subject="google-new-456",
        email="new.user@example.com",
        email_verified=True,
        email_authoritative=False,
        name="Новый пользователь",
        picture=None,
        raw={"sub": "google-new-456", "email_verified": True},
    )

    state, _cookie = await _start(client)
    callback = await client.get(
        "/api/v1/auth/oauth/google/callback",
        params={"state": state, "code": "new-code"},
    )

    assert callback.status_code == 303
    assert callback.headers["location"] == get_settings().app_url
    async with get_engine().connect() as connection:
        row = (
            await connection.execute(
                text(
                    "SELECT u.email, u.password_hash, u.email_verified_at, o.provider_user_id "
                    "FROM users u JOIN oauth_accounts o ON o.user_id = u.id"
                )
            )
        ).one()
    assert row.email == "new.user@example.com"
    assert row.password_hash is None
    assert row.email_verified_at is not None
    assert row.provider_user_id == "google-new-456"


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
@patch("app.api.v1.auth.google_oauth.exchange_code", new_callable=AsyncMock)
async def test_google_oauth_does_not_merge_non_authoritative_external_email(
    mock_exchange: AsyncMock,
    mock_email: AsyncMock,
    client: pytest.fixture,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _enable_google(monkeypatch)
    await client.post(
        "/api/v1/auth/register",
        json={
            "email": "owner@example.com",
            "password": "Str0ngP@ss!",
            "username": "externalowner",
        },
    )
    mock_exchange.return_value = GoogleProfile(
        subject="google-external-123",
        email="owner@example.com",
        email_verified=True,
        email_authoritative=False,
        name=None,
        picture=None,
        raw={"sub": "google-external-123", "email_verified": True},
    )

    state, _cookie = await _start(client)
    callback = await client.get(
        "/api/v1/auth/oauth/google/callback",
        params={"state": state, "code": "external-code"},
    )

    assert callback.status_code == 303
    assert "oauth_error=link_required" in callback.headers["location"]
    assert callback.cookies.get("remora_refresh") is None
    async with get_engine().connect() as connection:
        assert await connection.scalar(text("SELECT count(*) FROM users")) == 1
        assert await connection.scalar(text("SELECT count(*) FROM oauth_accounts")) == 0


@patch("app.api.v1.auth.google_oauth.exchange_code", new_callable=AsyncMock)
async def test_google_oauth_rejects_unverified_email(
    mock_exchange: AsyncMock,
    client: pytest.fixture,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _enable_google(monkeypatch)
    mock_exchange.return_value = GoogleProfile(
        subject="google-unverified",
        email="unverified@example.com",
        email_verified=False,
        email_authoritative=False,
        name=None,
        picture=None,
        raw={"sub": "google-unverified", "email_verified": False},
    )

    state, _cookie = await _start(client)
    callback = await client.get(
        "/api/v1/auth/oauth/google/callback",
        params={"state": state, "code": "bad-code"},
    )

    assert callback.status_code == 303
    assert "oauth_error=failed" in callback.headers["location"]
    assert callback.cookies.get("remora_refresh") is None
    async with get_engine().connect() as connection:
        assert await connection.scalar(text("SELECT count(*) FROM users")) == 0


async def test_google_oauth_rejects_invalid_state_and_external_next(
    client: pytest.fixture,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _enable_google(monkeypatch)
    _state, _cookie = await _start(client, next_url="https://evil.example/phishing")

    callback = await client.get(
        "/api/v1/auth/oauth/google/callback",
        params={"state": "00000000-0000-0000-0000-000000000000", "code": "code"},
    )

    assert callback.status_code == 303
    location = callback.headers["location"]
    assert "oauth_error=invalid_state" in location
    assert "evil.example" not in location


async def test_google_oauth_unavailable_redirects_to_login(client: pytest.fixture) -> None:
    settings = get_settings()
    settings.google_oauth_client_id = None
    settings.google_oauth_client_secret = None

    response = await client.get("/api/v1/auth/oauth/google/start")

    assert response.status_code == 303
    assert "oauth_error=unavailable" in response.headers["location"]
