"""Версионированное шифрование коротких секретов, хранимых в PostgreSQL."""

from __future__ import annotations

import base64
import hashlib
import os

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.core.config import get_settings

_PREFIX = "rmenc:v1"


class SecretEncryptionError(ValueError):
    pass


def _keys() -> list[tuple[str, bytes]]:
    configured = get_settings().data_encryption_keys
    result: list[tuple[str, bytes]] = []
    for item in configured:
        raw_value = item.get_secret_value()
        try:
            key = base64.urlsafe_b64decode(raw_value.encode())
        except (ValueError, TypeError) as exc:
            raise SecretEncryptionError("Некорректный ключ шифрования") from exc
        if len(key) != 32:
            raise SecretEncryptionError("Ключ шифрования должен содержать 32 байта")
        key_id = hashlib.sha256(key).hexdigest()[:12]
        result.append((key_id, key))
    if not result:
        raise SecretEncryptionError("Ключи шифрования не настроены")
    if len({key_id for key_id, _ in result}) != len(result):
        raise SecretEncryptionError("Ключи шифрования повторяются")
    return result


def encrypt_secret(value: str, *, context: str) -> str:
    key_id, key = _keys()[0]
    nonce = os.urandom(12)
    encrypted = AESGCM(key).encrypt(nonce, value.encode(), context.encode())
    payload = base64.urlsafe_b64encode(nonce + encrypted).decode()
    return f"{_PREFIX}:{key_id}:{payload}"


def decrypt_secret(value: str, *, context: str) -> str:
    parts = value.split(":", 3)
    if len(parts) != 4 or ":".join(parts[:2]) != _PREFIX:
        raise SecretEncryptionError("Неизвестный формат зашифрованного секрета")
    key_id, encoded = parts[2], parts[3]
    key = next((candidate for candidate_id, candidate in _keys() if candidate_id == key_id), None)
    if key is None:
        raise SecretEncryptionError("Ключ расшифрования недоступен")
    try:
        payload = base64.urlsafe_b64decode(encoded.encode())
        plain = AESGCM(key).decrypt(payload[:12], payload[12:], context.encode())
        return plain.decode()
    except (InvalidTag, ValueError, UnicodeDecodeError) as exc:
        raise SecretEncryptionError("Не удалось расшифровать секрет") from exc


def needs_reencryption(value: str) -> bool:
    parts = value.split(":", 3)
    return len(parts) != 4 or parts[2] != _keys()[0][0]
