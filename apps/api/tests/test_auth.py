"""Тесты аутентификации: регистрация, вход, ротация, /me, сброс пароля."""

from unittest.mock import AsyncMock, patch

import pytest

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
    # Регистрация возвращает верификационный токен (второй элемент tuple)
    service_call = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "verify@example.com",
            "password": "Str0ngP@ss!",
            "username": "verifyuser",
        },
    )
    assert service_call.status_code == 201

    # Мок send_verification_email был вызван — токен внутри письма.
    # Но в тесте проще сгенерировать новый через сервис:
    from app.core.security import create_jwt

    # Получаем user_id через /auth/login
    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "verify@example.com", "password": "Str0ngP@ss!"},
    )
    access = login_resp.json()["access_token"]
    me_resp = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {access}"},
    )
    user_id = me_resp.json()["id"]

    token = create_jwt(user_id, "email_verification", extra={"email": "verify@example.com"})
    resp = await client.post("/api/v1/auth/verify-email", json={"token": token})
    assert resp.status_code == 200
    assert resp.json()["user"]["email_verified"] is True


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

    # Генерируем токен сброса
    from app.core.security import create_jwt

    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "reset@example.com", "password": "Str0ngP@ss!"},
    )
    me_resp = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {login_resp.json()['access_token']}"},
    )
    user_id = me_resp.json()["id"]
    token = create_jwt(user_id, "password_reset", extra={"email": "reset@example.com"})

    # Сброс пароля
    resp = await client.post(
        "/api/v1/auth/password-reset/confirm",
        json={"token": token, "new_password": "NewStr0ngP@ss!"},
    )
    assert resp.status_code == 200

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
