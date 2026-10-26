"""Небольшая реализация RFC 6238 без внешнего сетевого сервиса."""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import struct
import time
from urllib.parse import quote


def generate_totp_secret() -> str:
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")


def totp_step(now: int | None = None) -> int:
    return (now if now is not None else int(time.time())) // 30


def totp_code(secret: str, step: int) -> str:
    padded = secret + "=" * ((8 - len(secret) % 8) % 8)
    key = base64.b32decode(padded, casefold=True)
    digest = hmac.new(key, struct.pack(">Q", step), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    number = struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF
    return f"{number % 1_000_000:06d}"


def verify_totp(secret: str, code: str, *, now: int | None = None) -> int | None:
    if len(code) != 6 or not code.isdigit():
        return None
    current = totp_step(now)
    for step in range(current - 1, current + 2):
        if hmac.compare_digest(totp_code(secret, step), code):
            return step
    return None


def provisioning_uri(secret: str, email: str) -> str:
    label = quote(f"Remora:{email}", safe="")
    return f"otpauth://totp/{label}?secret={secret}&issuer=Remora&algorithm=SHA1&digits=6&period=30"
