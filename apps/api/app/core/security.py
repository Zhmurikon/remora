"""Хэширование паролей (argon2id) и JWT-токены (access).

Refresh-токен — не JWT, а рандомный секрет; его хэш хранится в БД.
Это позволяет отзывать токены сервером и детектить переиспользование.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any, Literal
from uuid import UUID

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

from app.core.config import get_settings

_hasher = PasswordHasher()

# Тип субъекта токена
TokenType = Literal["access", "admin", "email_verification", "password_reset"]


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except VerifyMismatchError:
        return False


def hash_token(token: str) -> str:
    """SHA-256 хэш refresh-токена для хранения в БД."""
    return hashlib.sha256(token.encode()).hexdigest()


def generate_refresh_token() -> tuple[str, str]:
    """Возвращает (сырой токен, хэш). Сырой отдаётся клиенту, хэш — в БД."""
    raw = secrets.token_urlsafe(48)
    return raw, hash_token(raw)


def create_jwt(
    subject: str,
    token_type: TokenType = "access",
    *,
    extra: dict[str, str] | None = None,
) -> str:
    settings = get_settings()
    primary_key = settings.secret_key.get_secret_value()

    if token_type == "access":
        ttl = timedelta(minutes=settings.access_token_ttl_minutes)
    elif token_type == "admin":
        ttl = timedelta(minutes=settings.admin_token_ttl_minutes)
    elif token_type == "email_verification":
        ttl = timedelta(hours=settings.email_verification_ttl_hours)
    elif token_type == "password_reset":
        ttl = timedelta(minutes=settings.password_reset_ttl_minutes)

    now = datetime.now(tz=UTC)
    payload: dict[str, str | int] = {
        **(extra or {}),
        "sub": subject,
        "type": token_type,
        "iat": int(now.timestamp()),
        "exp": int((now + ttl).timestamp()),
    }

    key_id = hashlib.sha256(primary_key.encode()).hexdigest()[:12]
    return jwt.encode(payload, primary_key, algorithm="HS256", headers={"kid": key_id})


def decode_jwt(token: str, expected_type: TokenType) -> dict[str, Any] | None:
    """Декодирует JWT и проверяет тип. None — если токен невалиден."""
    settings = get_settings()
    keys = [
        settings.secret_key.get_secret_value(),
        *(key.get_secret_value() for key in settings.jwt_previous_secret_keys),
    ]
    try:
        header = jwt.get_unverified_header(token)
    except jwt.PyJWTError:
        return None
    key_id = header.get("kid")
    if isinstance(key_id, str):
        keys = [key for key in keys if hashlib.sha256(key.encode()).hexdigest()[:12] == key_id]
    payload = None
    for key in keys:
        try:
            payload = jwt.decode(
                token,
                key,
                algorithms=["HS256"],
                options={"require": ["sub", "type", "iat", "exp"]},
            )
            break
        except jwt.PyJWTError:
            continue
    if payload is None:
        return None

    if payload.get("type") != expected_type:
        return None
    subject = payload.get("sub")
    issued_at = payload.get("iat")
    expires_at = payload.get("exp")
    if (
        not isinstance(subject, str)
        or not isinstance(issued_at, int)
        or not isinstance(expires_at, int)
    ):
        return None
    try:
        UUID(subject)
    except ValueError:
        return None

    return payload
