"""Проверка CAPTCHA только при признаках автоматической регистрации."""

from __future__ import annotations

import httpx
import structlog

from app.core.config import get_settings
from app.core.errors import CaptchaRequiredError

log = structlog.get_logger()


async def verify_registration_captcha(token: str | None, remote_ip: str) -> None:
    settings = get_settings()
    secret = settings.turnstile_secret_key
    if not token or secret is None or not secret.get_secret_value():
        raise CaptchaRequiredError(details={"provider": "turnstile"})
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            response = await client.post(
                settings.turnstile_verify_url,
                data={
                    "secret": secret.get_secret_value(),
                    "response": token,
                    "remoteip": remote_ip,
                },
            )
        payload = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        log.warning("captcha.unavailable", error=type(exc).__name__)
        raise CaptchaRequiredError("Не удалось проверить CAPTCHA") from exc
    if response.status_code != 200 or payload.get("success") is not True:
        raise CaptchaRequiredError(details={"provider": "turnstile"})
