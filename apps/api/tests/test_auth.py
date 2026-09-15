"""Тесты аутентификации: регистрация, вход, ротация, /me, сброс пароля."""

import asyncio
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import text

from app.core.config import get_settings
from app.db.session import get_engine

# Email отправка мокается во всех тестах — MailHog не нужен
pytestmark = pytest.mark.asyncio


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_register_success(mock_send: AsyncMock, client: pytest.fixture) -> None:
    resp = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "test@example.com",
            "password": "Str0ngP@ss!",
            "username": "testuser",
        },
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["user"]["email"] == "test@example.com"
    assert body["user"]["username"] == "testuser"
    assert body["user"]["email_verified"] is False
    assert mock_send.await_count == 1


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_register_duplicate_email(mock_send: AsyncMock, client: pytest.fixture) -> None:
    payload = {
        "email": "dup@example.com",
        "password": "Str0ngP@ss!",
        "username": "user1",
    }
    await client.post("/api/v1/auth/register", json=payload)
    resp = await client.post("/api/v1/auth/register", json={**payload, "username": "user2"})
    assert resp.status_code == 409
    assert resp.json()["code"] == "CONFLICT"


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_register_weak_password(mock_send: AsyncMock, client: pytest.fixture) -> None:
    resp = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "weak@example.com",
            "password": "password1",
            "username": "weakuser",
        },
    )
    assert resp.status_code == 409
    assert "утечк" in resp.json()["message"].lower()


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_register_duplicate_username(mock_send: AsyncMock, client: pytest.fixture) -> None:
    await client.post(
        "/api/v1/auth/register",
        json={
            "email": "a@example.com",
            "password": "Str0ngP@ss!",
            "username": "sameuser",
        },
    )
    resp = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "b@example.com",
            "password": "Str0ngP@ss!",
            "username": "sameuser",
        },
    )
    assert resp.status_code == 409


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_register_rate_limit(mock_send: AsyncMock, client: pytest.fixture) -> None:
    payload = {
        "email": "limited-register@example.com",
        "password": "Str0ngP@ss!",
        "username": "limitedregister",
    }
    assert (await client.post("/api/v1/auth/register", json=payload)).status_code == 201
    for _ in range(4):
        resp = await client.post("/api/v1/auth/register", json=payload)
        assert resp.status_code == 409

    blocked = await client.post("/api/v1/auth/register", json=payload)
    assert blocked.status_code == 429
    assert blocked.json()["code"] == "RATE_LIMITED"


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_login_success(mock_send: AsyncMock, client: pytest.fixture) -> None:
    await client.post(
        "/api/v1/auth/register",
        json={
            "email": "login@example.com",
            "password": "Str0ngP@ss!",
            "username": "loginuser",
        },
    )
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "login@example.com", "password": "Str0ngP@ss!"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["access_token"]
    assert body["user"]["email"] == "login@example.com"
    # refresh cookie установлен
    assert "remora_refresh" in resp.cookies


async def test_login_wrong_password(client: pytest.fixture) -> None:
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "nobody@example.com", "password": "Wr0ngP@ss!"},
    )
    assert resp.status_code == 401
    assert resp.json()["code"] == "UNAUTHORIZED"


@pytest.mark.parametrize("account_status", ["suspended", "deleted"])
@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_login_rejects_unavailable_account(
    mock_send: AsyncMock,
    client: pytest.fixture,
    account_status: str,
) -> None:
    email = f"{account_status}@example.com"
    await client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "Str0ngP@ss!",
            "username": f"user{account_status}",
        },
    )
    async with get_engine().begin() as connection:
        await connection.execute(
            text("UPDATE users SET status = CAST(:status AS userstatus) WHERE email = :email"),
            {"status": account_status, "email": email},
        )

    response = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "Str0ngP@ss!"},
    )
    assert response.status_code == 401
    assert response.json()["code"] == "UNAUTHORIZED"
    assert "remora_refresh" not in response.cookies


async def test_login_rate_limit(client: pytest.fixture) -> None:
    payload = {"email": "limited@example.com", "password": "Wr0ngP@ss!"}
    for _ in range(10):
        resp = await client.post("/api/v1/auth/login", json=payload)
        assert resp.status_code == 401

    blocked = await client.post("/api/v1/auth/login", json=payload)
    assert blocked.status_code == 429
    assert blocked.json()["code"] == "RATE_LIMITED"
    assert blocked.json()["details"]["scope"] == "login"


async def test_password_reset_rate_limit(client: pytest.fixture) -> None:
    payload = {"email": "limited-reset@example.com"}
    for _ in range(5):
        resp = await client.post("/api/v1/auth/password-reset", json=payload)
        assert resp.status_code == 204

    blocked = await client.post("/api/v1/auth/password-reset", json=payload)
    assert blocked.status_code == 429
    assert blocked.json()["code"] == "RATE_LIMITED"


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_refresh_token_rotation(mock_send: AsyncMock, client: pytest.fixture) -> None:
    # Регистрация + вход
    await client.post(
        "/api/v1/auth/register",
        json={
            "email": "refresh@example.com",
            "password": "Str0ngP@ss!",
            "username": "refreshuser",
        },
    )
    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "refresh@example.com", "password": "Str0ngP@ss!"},
    )
    refresh_token = login_resp.cookies.get("remora_refresh")
    assert refresh_token is not None

    # Первое обновление — должно работать
    resp1 = await client.post(
        "/api/v1/auth/refresh",
        cookies={"remora_refresh": refresh_token},
    )
    assert resp1.status_code == 200
    assert resp1.json()["access_token"]
    new_refresh = resp1.cookies.get("remora_refresh")
    assert new_refresh is not None
    assert new_refresh != refresh_token

    # Повторное использование старого токена — должно дать 401
    resp2 = await client.post(
        "/api/v1/auth/refresh",
        cookies={"remora_refresh": refresh_token},
    )
    assert resp2.status_code == 401

    # Новый токен тоже должен быть отозван (детекция кражи — весь family)
    resp3 = await client.post(
        "/api/v1/auth/refresh",
        cookies={"remora_refresh": new_refresh},
    )
    assert resp3.status_code == 401


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_concurrent_refresh_revokes_token_family(
    mock_send: AsyncMock, client: pytest.fixture
) -> None:
    await client.post(
        "/api/v1/auth/register",
        json={
            "email": "concurrent@example.com",
            "password": "Str0ngP@ss!",
            "username": "concurrentuser",
        },
    )
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "concurrent@example.com", "password": "Str0ngP@ss!"},
    )
    old_refresh = login.cookies.get("remora_refresh")
    assert old_refresh is not None

    first, second = await asyncio.gather(
        client.post("/api/v1/auth/refresh", cookies={"remora_refresh": old_refresh}),
        client.post("/api/v1/auth/refresh", cookies={"remora_refresh": old_refresh}),
    )
    assert sorted([first.status_code, second.status_code]) == [200, 401]

    successful = first if first.status_code == 200 else second
    rotated_refresh = successful.cookies.get("remora_refresh")
    assert rotated_refresh is not None
    family_revoked = await client.post(
        "/api/v1/auth/refresh",
        cookies={"remora_refresh": rotated_refresh},
    )
    assert family_revoked.status_code == 401


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_logout(mock_send: AsyncMock, client: pytest.fixture) -> None:
    await client.post(
        "/api/v1/auth/register",
        json={
            "email": "logout@example.com",
            "password": "Str0ngP@ss!",
            "username": "logoutuser",
        },
    )
    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "logout@example.com", "password": "Str0ngP@ss!"},
    )
    refresh_token = login_resp.cookies.get("remora_refresh")

    resp = await client.post(
        "/api/v1/auth/logout",
        cookies={"remora_refresh": refresh_token},
    )
    assert resp.status_code == 204

    # После выхода refresh больше не работает
    resp2 = await client.post(
        "/api/v1/auth/refresh",
        cookies={"remora_refresh": refresh_token},
    )
    assert resp2.status_code == 401


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_custom_refresh_cookie_name(
    mock_send: AsyncMock,
    client: pytest.fixture,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(get_settings(), "refresh_cookie_name", "custom_refresh")
    await client.post(
        "/api/v1/auth/register",
        json={
            "email": "cookie@example.com",
            "password": "Str0ngP@ss!",
            "username": "cookieuser",
        },
    )
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "cookie@example.com", "password": "Str0ngP@ss!"},
    )
    refresh_token = login.cookies.get("custom_refresh")
    assert refresh_token is not None
    assert "remora_refresh" not in login.cookies

    refreshed = await client.post(
        "/api/v1/auth/refresh",
        cookies={"custom_refresh": refresh_token},
    )
    assert refreshed.status_code == 200
    assert refreshed.cookies.get("custom_refresh") is not None


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_me_requires_auth(mock_send: AsyncMock, client: pytest.fixture) -> None:
    resp = await client.get("/api/v1/auth/me")
    assert resp.status_code == 401


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_me_with_valid_token(mock_send: AsyncMock, client: pytest.fixture) -> None:
    await client.post(
        "/api/v1/auth/register",
        json={
            "email": "me@example.com",
            "password": "Str0ngP@ss!",
            "username": "meuser",
        },
    )
    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "me@example.com", "password": "Str0ngP@ss!"},
    )
    access_token = login_resp.json()["access_token"]

    resp = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["email"] == "me@example.com"


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_verify_email(mock_send: AsyncMock, client: pytest.fixture) -> None:
    service_call = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "verify@example.com",
            "password": "Str0ngP@ss!",
            "username": "verifyuser",
        },
    )
    assert service_call.status_code == 201

    token = mock_send.await_args.args[1]
    resp = await client.post("/api/v1/auth/verify-email", json={"token": token})
    assert resp.status_code == 200
    assert resp.json()["user"]["email_verified"] is True

    reused = await client.post("/api/v1/auth/verify-email", json={"token": token})
    assert reused.status_code == 401
    assert reused.json()["code"] == "UNAUTHORIZED"


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
@patch("app.services.auth.send_password_reset_email", new_callable=AsyncMock)
async def test_password_reset(
    mock_reset: AsyncMock,
    mock_verify: AsyncMock,
    client: pytest.fixture,
) -> None:
    await client.post(
        "/api/v1/auth/register",
        json={
            "email": "reset@example.com",
            "password": "Str0ngP@ss!",
            "username": "resetuser",
        },
    )

    # Запрос сброса
    resp = await client.post(
        "/api/v1/auth/password-reset",
        json={"email": "reset@example.com"},
    )
    assert resp.status_code == 204

    token = mock_reset.await_args.args[1]

    # Сброс пароля
    resp = await client.post(
        "/api/v1/auth/password-reset/confirm",
        json={"token": token, "new_password": "NewStr0ngP@ss!"},
    )
    assert resp.status_code == 200

    # Одна и та же ссылка не позволяет сменить пароль повторно.
    reused = await client.post(
        "/api/v1/auth/password-reset/confirm",
        json={"token": token, "new_password": "An0therStr0ngP@ss!"},
    )
    assert reused.status_code == 401
    assert reused.json()["code"] == "UNAUTHORIZED"

    # Старый пароль не работает
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "reset@example.com", "password": "Str0ngP@ss!"},
    )
    assert resp.status_code == 401

    # Новый пароль работает
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "reset@example.com", "password": "NewStr0ngP@ss!"},
    )
    assert resp.status_code == 200
