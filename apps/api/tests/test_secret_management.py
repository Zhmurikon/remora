"""Ротация JWT и шифрование прикладных секретов."""

import base64
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

import jwt
import pytest
from pydantic import SecretStr, ValidationError

from app.core.config import Settings
from app.core.encryption import (
    SecretEncryptionError,
    decrypt_secret,
    encrypt_secret,
    needs_reencryption,
)
from app.core.security import create_jwt, decode_jwt


def _auth_settings(primary: str, previous: list[str] | None = None) -> SimpleNamespace:
    return SimpleNamespace(
        secret_key=SecretStr(primary),
        jwt_previous_secret_keys=[SecretStr(item) for item in previous or []],
        access_token_ttl_minutes=15,
        email_verification_ttl_hours=24,
        password_reset_ttl_minutes=30,
    )


def test_jwt_rotation_accepts_previous_key_and_signs_with_primary() -> None:
    old = "old-secret-key-at-least-32-characters-long"
    new = "new-secret-key-at-least-32-characters-long"
    subject = str(uuid4())
    now = datetime.now(UTC)
    legacy = jwt.encode(
        {
            "sub": subject,
            "type": "access",
            "iat": int(now.timestamp()),
            "exp": int((now + timedelta(minutes=5)).timestamp()),
        },
        old,
        algorithm="HS256",
    )
    with patch("app.core.security.get_settings", return_value=_auth_settings(new, [old])):
        assert decode_jwt(legacy, "access") is not None
        current = create_jwt(subject)
        assert decode_jwt(current, "access") is not None
        assert jwt.get_unverified_header(current)["kid"]

    with patch("app.core.security.get_settings", return_value=_auth_settings(new)):
        assert decode_jwt(legacy, "access") is None


def test_encryption_key_rotation_and_context_binding() -> None:
    old = base64.urlsafe_b64encode(b"o" * 32).decode()
    new = base64.urlsafe_b64encode(b"n" * 32).decode()
    with patch(
        "app.core.encryption.get_settings",
        return_value=SimpleNamespace(data_encryption_keys=[SecretStr(old)]),
    ):
        encrypted = encrypt_secret("totp-seed", context="admin:42")
        assert decrypt_secret(encrypted, context="admin:42") == "totp-seed"
        assert needs_reencryption(encrypted) is False

    with patch(
        "app.core.encryption.get_settings",
        return_value=SimpleNamespace(data_encryption_keys=[SecretStr(new), SecretStr(old)]),
    ):
        assert decrypt_secret(encrypted, context="admin:42") == "totp-seed"
        assert needs_reencryption(encrypted) is True
        with pytest.raises(SecretEncryptionError):
            decrypt_secret(encrypted, context="admin:other")


def test_non_local_environment_rejects_development_secrets() -> None:
    with pytest.raises(ValidationError, match="Небезопасные секреты"):
        Settings(
            environment="production",
            secret_key="local-dev-secret-key-change-me-at-least-32-chars",
            database_url="postgresql+asyncpg://app:secret@db/remora",
            redis_url="redis://redis/0",
            cookie_secure=True,
            data_encryption_keys=[SecretStr(base64.urlsafe_b64encode(b"k" * 32).decode())],
        )
