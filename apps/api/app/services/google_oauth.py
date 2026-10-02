"""Минимальный клиент Google OpenID Connect для серверного OAuth flow."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from urllib.parse import urlencode

import httpx

from app.core.config import get_settings
from app.core.errors import UnauthorizedError

GOOGLE_AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo"


@dataclass(frozen=True, slots=True)
class GoogleProfile:
    subject: str
    email: str
    email_verified: bool
    email_authoritative: bool
    name: str | None
    picture: str | None
    raw: dict[str, Any]


def google_oauth_enabled() -> bool:
    settings = get_settings()
    secret = settings.google_oauth_client_secret
    return bool(
        settings.google_oauth_client_id and secret is not None and secret.get_secret_value()
    )


def build_authorization_url(state: str) -> str:
    settings = get_settings()
    if not google_oauth_enabled():
        raise UnauthorizedError("Вход через Google пока не настроен")

    query = urlencode(
        {
            "client_id": settings.google_oauth_client_id,
            "redirect_uri": settings.google_oauth_redirect_uri,
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "prompt": "select_account",
        }
    )
    return f"{GOOGLE_AUTHORIZATION_ENDPOINT}?{query}"


async def exchange_code(code: str) -> GoogleProfile:
    settings = get_settings()
    secret = settings.google_oauth_client_secret
    if not settings.google_oauth_client_id or secret is None or not secret.get_secret_value():
        raise UnauthorizedError("Вход через Google пока не настроен")

    timeout = httpx.Timeout(10.0)
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            token_response = await client.post(
                GOOGLE_TOKEN_ENDPOINT,
                data={
                    "code": code,
                    "client_id": settings.google_oauth_client_id,
                    "client_secret": secret.get_secret_value(),
                    "redirect_uri": settings.google_oauth_redirect_uri,
                    "grant_type": "authorization_code",
                },
            )
            token_response.raise_for_status()
            token_payload = token_response.json()
            if not isinstance(token_payload, dict):
                raise UnauthorizedError("Google вернул некорректный ответ")
            access_token = token_payload.get("access_token")
            if not isinstance(access_token, str) or not access_token:
                raise UnauthorizedError("Google не вернул токен доступа")

            profile_response = await client.get(
                GOOGLE_USERINFO_ENDPOINT,
                headers={"Authorization": f"Bearer {access_token}"},
            )
            profile_response.raise_for_status()
            raw_profile = profile_response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise UnauthorizedError("Не удалось подтвердить вход через Google") from exc

    if not isinstance(raw_profile, dict):
        raise UnauthorizedError("Google вернул некорректный профиль")

    subject = raw_profile.get("sub")
    email = raw_profile.get("email")
    verified = raw_profile.get("email_verified")
    if (
        not isinstance(subject, str)
        or not subject
        or len(subject) > 255
        or not isinstance(email, str)
        or not email
        or len(email) > 320
        or verified is not True
    ):
        raise UnauthorizedError("Google не подтвердил адрес электронной почты")

    name = raw_profile.get("name")
    picture = raw_profile.get("picture")
    normalized_email = email.strip().casefold()
    hosted_domain = raw_profile.get("hd")
    return GoogleProfile(
        subject=subject,
        email=normalized_email,
        email_verified=True,
        email_authoritative=(
            normalized_email.endswith("@gmail.com")
            or (isinstance(hosted_domain, str) and bool(hosted_domain))
        ),
        name=name[:64] if isinstance(name, str) and name else None,
        picture=picture[:512] if isinstance(picture, str) and picture else None,
        raw=raw_profile,
    )
