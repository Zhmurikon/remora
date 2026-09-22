"""Тесты аутентификации: регистрация, вход, ротация, /me, сброс пароля."""

import asyncio
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch

import jwt
import pytest
from sqlalchemy import text

from app.core.config import get_settings
from app.core.security import create_jwt, hash_token
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
async def test_concurrent_registration_returns_conflict(
    mock_send: AsyncMock, client: pytest.fixture
) -> None:
    first, second = await asyncio.gather(
        client.post(
            "/api/v1/auth/register",
            json={
                "email": "race@example.com",
                "password": "Str0ngP@ss!",
                "username": "racefirst",
            },
        ),
        client.post(
            "/api/v1/auth/register",
            json={
                "email": "race@example.com",
                "password": "Str0ngP@ss!",
                "username": "racesecond",
            },
        ),
    )
    assert sorted([first.status_code, second.status_code]) == [201, 409]
    conflict = first if first.status_code == 409 else second
    assert conflict.json()["code"] == "CONFLICT"


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
async def test_me_rejects_invalid_jwt_claims(mock_send: AsyncMock, client: pytest.fixture) -> None:
    await client.post(
        "/api/v1/auth/register",
        json={
            "email": "claims@example.com",
            "password": "Str0ngP@ss!",
            "username": "claimsuser",
        },
    )
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "claims@example.com", "password": "Str0ngP@ss!"},
    )
    valid_access = login.json()["access_token"]
    valid_payload = jwt.decode(
        valid_access,
        get_settings().secret_key,
        algorithms=["HS256"],
    )
    user_id = valid_payload["sub"]
    now = datetime.now(tz=UTC)
    malformed_tokens = [
        "not-a-jwt",
        jwt.encode(
            {"type": "access", "iat": now, "exp": now + timedelta(minutes=5)},
            get_settings().secret_key,
            algorithm="HS256",
        ),
        jwt.encode(
            {
                "sub": "not-a-uuid",
                "type": "access",
                "iat": now,
                "exp": now + timedelta(minutes=5),
            },
            get_settings().secret_key,
            algorithm="HS256",
        ),
        jwt.encode(
            {
                "sub": user_id,
                "type": "access",
                "iat": now - timedelta(minutes=10),
                "exp": now - timedelta(minutes=5),
            },
            get_settings().secret_key,
            algorithm="HS256",
        ),
        create_jwt(user_id, "email_verification", extra={"email": "claims@example.com"}),
    ]

    for token in malformed_tokens:
        response = await client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 401
        assert response.json()["code"] == "UNAUTHORIZED"


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
async def test_email_verification_link_expires(
    mock_send: AsyncMock, client: pytest.fixture
) -> None:
    await client.post(
        "/api/v1/auth/register",
        json={
            "email": "expired@example.com",
            "password": "Str0ngP@ss!",
            "username": "expireduser",
        },
    )
    token = mock_send.await_args.args[1]
    async with get_engine().begin() as connection:
        await connection.execute(
            text(
                "UPDATE action_tokens SET expires_at = now() - interval '1 second' "
                "WHERE token_hash = :token_hash"
            ),
            {"token_hash": hash_token(token)},
        )

    response = await client.post("/api/v1/auth/verify-email", json={"token": token})
    assert response.status_code == 401


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_email_verification_isolated_between_users(
    mock_send: AsyncMock, client: pytest.fixture
) -> None:
    credentials = [
        ("first@example.com", "firstuser"),
        ("second@example.com", "seconduser"),
    ]
    for email, username in credentials:
        await client.post(
            "/api/v1/auth/register",
            json={"email": email, "password": "Str0ngP@ss!", "username": username},
        )

    first_token = mock_send.await_args_list[0].args[1]
    verified = await client.post("/api/v1/auth/verify-email", json={"token": first_token})
    assert verified.status_code == 200
    assert verified.json()["user"]["email"] == "first@example.com"

    for email, _username in credentials:
        login = await client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": "Str0ngP@ss!"},
        )
        me = await client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {login.json()['access_token']}"},
        )
        assert me.json()["email_verified"] is (email == "first@example.com")


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


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
@patch("app.services.auth.send_password_reset_email", new_callable=AsyncMock)
async def test_password_reset_link_expires(
    mock_reset: AsyncMock,
    mock_verify: AsyncMock,
    client: pytest.fixture,
) -> None:
    await client.post(
        "/api/v1/auth/register",
        json={
            "email": "expired-reset@example.com",
            "password": "Str0ngP@ss!",
            "username": "expiredreset",
        },
    )
    await client.post(
        "/api/v1/auth/password-reset",
        json={"email": "expired-reset@example.com"},
    )
    token = mock_reset.await_args.args[1]
    async with get_engine().begin() as connection:
        await connection.execute(
            text(
                "UPDATE action_tokens SET expires_at = now() - interval '1 second' "
                "WHERE token_hash = :token_hash"
            ),
            {"token_hash": hash_token(token)},
        )

    response = await client.post(
        "/api/v1/auth/password-reset/confirm",
        json={"token": token, "new_password": "NewStr0ngP@ss!"},
    )
    assert response.status_code == 401


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_profile_and_password_settings(mock_send: AsyncMock, client: pytest.fixture) -> None:
    await client.post(
        "/api/v1/auth/register",
        json={
            "email": "settings@example.com",
            "password": "Str0ngP@ss!",
            "username": "settingsuser",
        },
    )
    login = await client.post(
        "/api/v1/auth/login", json={"email": "settings@example.com", "password": "Str0ngP@ss!"}
    )
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    profile = await client.patch(
        "/api/v1/auth/me",
        headers=headers,
        json={
            "username": "newsettings",
            "display_name": "Новый профиль",
            "locale": "ru",
            "timezone": "Asia/Vladivostok",
        },
    )
    assert profile.status_code == 200
    assert profile.json()["username"] == "newsettings"
    assert profile.json()["display_name"] == "Новый профиль"

    wrong = await client.post(
        "/api/v1/auth/change-password",
        headers=headers,
        json={"current_password": "WrongP@ss1!", "new_password": "NewStr0ngP@ss!"},
    )
    assert wrong.status_code == 401
    changed = await client.post(
        "/api/v1/auth/change-password",
        headers=headers,
        json={"current_password": "Str0ngP@ss!", "new_password": "NewStr0ngP@ss!"},
    )
    assert changed.status_code == 204
    relogin = await client.post(
        "/api/v1/auth/login", json={"email": "settings@example.com", "password": "NewStr0ngP@ss!"}
    )
    assert relogin.status_code == 200


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_sessions_are_isolated_by_user(mock_send: AsyncMock, client: pytest.fixture) -> None:
    for number in (1, 2):
        await client.post(
            "/api/v1/auth/register",
            json={
                "email": f"session{number}@example.com",
                "password": "Str0ngP@ss!",
                "username": f"sessionuser{number}",
            },
        )
    first = await client.post(
        "/api/v1/auth/login",
        json={"email": "session1@example.com", "password": "Str0ngP@ss!"},
        headers={"user-agent": "First device"},
    )
    second = await client.post(
        "/api/v1/auth/login", json={"email": "session2@example.com", "password": "Str0ngP@ss!"}
    )
    first_headers = {"Authorization": f"Bearer {first.json()['access_token']}"}
    second_headers = {"Authorization": f"Bearer {second.json()['access_token']}"}

    sessions = await client.get(
        "/api/v1/auth/sessions",
        headers=first_headers,
        cookies={"remora_refresh": first.cookies["remora_refresh"]},
    )
    assert sessions.status_code == 200
    assert len(sessions.json()) == 1
    assert sessions.json()[0]["current"] is True

    forbidden = await client.delete(
        f"/api/v1/auth/sessions/{sessions.json()[0]['id']}", headers=second_headers
    )
    assert forbidden.status_code == 404
    revoked = await client.delete(
        f"/api/v1/auth/sessions/{sessions.json()[0]['id']}", headers=first_headers
    )
    assert revoked.status_code == 204


# ── Мобильный auth-flow (X-Client: mobile) ───────────────────────────


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_mobile_login_returns_refresh_in_body(
    mock_send: AsyncMock, client: pytest.fixture
) -> None:
    """Мобильный клиент (X-Client: mobile) получает refresh-токен в теле ответа."""
    await client.post(
        "/api/v1/auth/register",
        json={
            "email": "mobile@example.com",
            "password": "Str0ngP@ss!",
            "username": "mobileuser",
        },
    )
    token = mock_send.await_args.args[1]
    await client.post("/api/v1/auth/verify-email", json={"token": token})

    mobile_headers = {"X-Client": "mobile"}
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "mobile@example.com", "password": "Str0ngP@ss!"},
        headers=mobile_headers,
    )
    assert login.status_code == 200
    body = login.json()
    assert body["access_token"]
    assert body["refresh_token"] is not None
    assert len(body["refresh_token"]) > 20


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_web_login_no_refresh_in_body(
    mock_send: AsyncMock, client: pytest.fixture
) -> None:
    """Веб-клиент НЕ получает refresh-токен в теле — только через cookie."""
    resp = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "web@example.com",
            "password": "Str0ngP@ss!",
            "username": "webuser",
        },
    )
    assert resp.status_code == 201

    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "web@example.com", "password": "Str0ngP@ss!"},
    )
    assert login.status_code == 200
    body = login.json()
    assert body["access_token"]
    assert body["refresh_token"] is None
    # Но cookie установлена
    assert "remora_refresh" in login.cookies


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_mobile_refresh_via_body(
    mock_send: AsyncMock, client: pytest.fixture
) -> None:
    """Мобильный refresh через тело (без cookie) — возвращает новый refresh."""
    resp = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "mrefresh@example.com",
            "password": "Str0ngP@ss!",
            "username": "mrefresh",
        },
    )
    assert resp.status_code == 201

    mobile_headers = {"X-Client": "mobile"}
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "mrefresh@example.com", "password": "Str0ngP@ss!"},
        headers=mobile_headers,
    )
    refresh_token = login.json()["refresh_token"]

    # Refresh через тело, без cookie
    refreshed = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": refresh_token},
        headers=mobile_headers,
    )
    assert refreshed.status_code == 200
    assert refreshed.json()["access_token"]
    assert refreshed.json()["refresh_token"] is not None
    # Новый refresh-токен отличается от старого
    assert refreshed.json()["refresh_token"] != refresh_token


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_mobile_refresh_via_header(
    mock_send: AsyncMock, client: pytest.fixture
) -> None:
    """Refresh через заголовок X-Refresh-Token тоже работает."""
    await client.post(
        "/api/v1/auth/register",
        json={
            "email": "mheader@example.com",
            "password": "Str0ngP@ss!",
            "username": "mheader",
        },
    )
    mobile_headers = {"X-Client": "mobile"}
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "mheader@example.com", "password": "Str0ngP@ss!"},
        headers=mobile_headers,
    )
    refresh_token = login.json()["refresh_token"]

    refreshed = await client.post(
        "/api/v1/auth/refresh",
        headers={**mobile_headers, "X-Refresh-Token": refresh_token},
    )
    assert refreshed.status_code == 200
    assert refreshed.json()["access_token"]


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_mobile_logout_via_body(
    mock_send: AsyncMock, client: pytest.fixture
) -> None:
    """Мобильный logout через тело (без cookie) отзывает токен."""
    await client.post(
        "/api/v1/auth/register",
        json={
            "email": "mlogout@example.com",
            "password": "Str0ngP@ss!",
            "username": "mlogout",
        },
    )
    mobile_headers = {"X-Client": "mobile"}
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "mlogout@example.com", "password": "Str0ngP@ss!"},
        headers=mobile_headers,
    )
    refresh_token = login.json()["refresh_token"]

    logout = await client.post(
        "/api/v1/auth/logout",
        json={"refresh_token": refresh_token},
        headers=mobile_headers,
    )
    assert logout.status_code == 204

    # После logout refresh-токен больше не работает
    reuse = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": refresh_token},
        headers=mobile_headers,
    )
    assert reuse.status_code == 401


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_mobile_verify_email_returns_tokens(
    mock_send: AsyncMock, client: pytest.fixture
) -> None:
    """Мобильный verify-email возвращает access + refresh, чтобы сразу войти."""
    await client.post(
        "/api/v1/auth/register",
        json={
            "email": "mverify@example.com",
            "password": "Str0ngP@ss!",
            "username": "mverify",
        },
    )
    token = mock_send.await_args.args[1]

    mobile_headers = {"X-Client": "mobile"}
    verified = await client.post(
        "/api/v1/auth/verify-email",
        json={"token": token},
        headers=mobile_headers,
    )
    assert verified.status_code == 200
    body = verified.json()
    assert body["access_token"]
    assert body["refresh_token"] is not None
    assert body["user"]["email_verified"] is True

    # Полученный access-токен работает для /me
    me = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {body['access_token']}"},
    )
    assert me.status_code == 200
    assert me.json()["email"] == "mverify@example.com"


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_mobile_refresh_reuse_revokes_family(
    mock_send: AsyncMock, client: pytest.fixture
) -> None:
    """Повторное использование мобильного refresh-токена отзывает всю семью."""
    await client.post(
        "/api/v1/auth/register",
        json={
            "email": "mreuse@example.com",
            "password": "Str0ngP@ss!",
            "username": "mreuse",
        },
    )
    mobile_headers = {"X-Client": "mobile"}
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "mreuse@example.com", "password": "Str0ngP@ss!"},
        headers=mobile_headers,
    )
    old_refresh = login.json()["refresh_token"]

    # Убираем cookie — мобильный клиент не использует cookie
    client.cookies.clear()

    # Первый refresh — успех
    refreshed = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": old_refresh},
        headers=mobile_headers,
    )
    assert refreshed.status_code == 200

    # Убираем cookie перед повторной попыткой
    client.cookies.clear()

    # Повторное использование старого токена — отзыв семьи
    reuse = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": old_refresh},
        headers=mobile_headers,
    )
    assert reuse.status_code == 401

    # Новый токен тоже отозван (вся семья)
    client.cookies.clear()
    new_refresh = refreshed.json()["refresh_token"]
    reuse2 = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": new_refresh},
        headers=mobile_headers,
    )
    assert reuse2.status_code == 401
