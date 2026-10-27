"""TOTP, шифрование секрета и одноразовые коды восстановления администратора."""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import struct
import time
from urllib.parse import quote

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import get_settings


def generate_totp_secret() -> str:
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")


def provisioning_uri(secret: str, account_name: str) -> str:
    issuer = "Запоминальня"
    label = quote(f"{issuer}:{account_name}", safe="")
    return (
        f"otpauth://totp/{label}?secret={secret}&issuer={quote(issuer, safe='')}&digits=6&period=30"
    )


def totp_code(secret: str, *, timestamp: int | None = None) -> str:
    moment = int(time.time()) if timestamp is None else timestamp
    padded = secret + "=" * (-len(secret) % 8)
    key = base64.b32decode(padded, casefold=True)
    counter = moment // 30
    digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    number = (struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF) % 1_000_000
    return f"{number:06d}"


def verify_totp(secret: str, code: str, *, timestamp: int | None = None) -> bool:
    clean = code.strip().replace(" ", "")
    if len(clean) != 6 or not clean.isdigit():
        return False
    moment = int(time.time()) if timestamp is None else timestamp
    return any(
        hmac.compare_digest(totp_code(secret, timestamp=moment + offset * 30), clean)
        for offset in (-1, 0, 1)
    )


def generate_recovery_codes(count: int = 8) -> list[str]:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return [
        "-".join(
            "".join(secrets.choice(alphabet) for _ in range(4))
            for _ in range(3)
        )
        for _ in range(count)
    ]


def hash_recovery_code(code: str) -> str:
    normalized = code.strip().replace("-", "").replace(" ", "").upper()
    pepper = get_settings().secret_key.encode()
    return hmac.new(pepper, normalized.encode(), hashlib.sha256).hexdigest()


def encrypt_totp_secret(secret: str) -> str:
    return _fernet().encrypt(secret.encode()).decode()


def decrypt_totp_secret(ciphertext: str) -> str:
    try:
        return _fernet().decrypt(ciphertext.encode()).decode()
    except InvalidToken as exc:
        raise RuntimeError("Не удалось расшифровать секрет 2FA") from exc


def _fernet() -> Fernet:
    settings = get_settings()
    configured = settings.admin_2fa_encryption_key
    source = configured.get_secret_value() if configured is not None else settings.secret_key
    key = base64.urlsafe_b64encode(hashlib.sha256(source.encode()).digest())
    return Fernet(key)
