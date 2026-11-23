"""Персональные разрешения браузерных MCP-клиентов поверх существующего отзыва подключений."""

import base64
import hashlib
import re
import secrets
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from uuid import UUID

import redis.asyncio as redis
from cryptography.fernet import Fernet
from mcp.server.auth.provider import (
    AccessToken,
    AuthorizationCode,
    AuthorizationParams,
    AuthorizeError,
    RefreshToken,
    RegistrationError,
    TokenError,
    construct_redirect_uri,
)
from mcp.shared.auth import OAuthClientInformationFull, OAuthToken
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import NotFoundError, UnauthorizedError, ValidationError
from app.core.security import hash_token
from app.db.session import get_session_factory
from app.models.api_tokens import ApiToken
from app.models.user import User
from app.schemas.api_tokens import AgentScope, ApiTokenCreate
from app.services.api_tokens import ApiTokenService

LEARNING: list[AgentScope] = ["materials:read", "materials:write", "courses:publish"]
SCOPES: list[AgentScope] = [*LEARNING, "blog:read", "blog:write", "blog:publish"]


def resource_url() -> str:
    return get_settings().web_url.rstrip("/") + "/mcp"


def client_name(uri: str) -> str:
    if uri == "https://claude.ai/api/mcp/auth_callback":
        return "Claude"
    if re.fullmatch(
        r"https://chatgpt\.com/(connector_platform_oauth_redirect|connector/oauth/[A-Za-z0-9_-]+)",
        uri,
    ):
        return "ChatGPT"
    raise RegistrationError(
        "invalid_redirect_uri", "Поддерживаются адреса возврата ChatGPT и Claude"
    )


@asynccontextmanager
async def store() -> AsyncIterator[redis.Redis]:
    async with redis.from_url(  # type: ignore[no-untyped-call]
        str(get_settings().redis_url), decode_responses=True
    ) as client:
        yield client


def key(kind: str, value: str) -> str:
    return "mcp-oauth:" + kind + ":" + hash_token(value)


def cipher() -> Fernet:
    material = hashlib.sha256(("remora-mcp-oauth:" + get_settings().secret_key).encode()).digest()
    return Fernet(base64.urlsafe_b64encode(material))


async def save(kind: str, value: str, data: BaseModel, ttl: int) -> None:
    # В записях клиента есть секрет, в записях обмена — одноразовые коды.
    async with store() as cache:
        await cache.set(key(kind, value), cipher().encrypt(data.model_dump_json().encode()), ex=ttl)


async def load[T: BaseModel](
    kind: str, value: str, model: type[T], *, consume: bool = False
) -> T | None:
    async with store() as cache:
        name = key(kind, value)
        raw = await cache.getdel(name) if consume else await cache.get(name)
    return model.model_validate_json(cipher().decrypt(raw)) if raw else None


class ConsentRequest(BaseModel):
    client_id: str
    params: AuthorizationParams


async def consent_record(ticket: str, *, consume: bool = False) -> ConsentRequest:
    pending = await load("consent", ticket, ConsentRequest, consume=consume)
    if pending is None:
        raise NotFoundError("Запрос подключения истёк. Откройте подключение в чате ещё раз.")
    return pending


async def decide(
    db: AsyncSession, user: User, ticket: str, scopes: list[AgentScope], allow: bool
) -> str:
    pending = await consent_record(ticket, consume=True)
    params = pending.params
    redirect_args = {"state": params.state} if params.state is not None else {}
    if not allow:
        return construct_redirect_uri(
            str(params.redirect_uri), error="access_denied", **redirect_args
        )
    if not scopes or not set(scopes).issubset(params.scopes or []):
        raise ValidationError("Выберите запрошенные права")
    grant = await ApiTokenService(db).create(
        user,
        ApiTokenCreate(
            name="MCP · " + client_name(str(params.redirect_uri)), scopes=scopes, expires_in_days=90
        ),
    )
    code = AuthorizationCode(
        **params.model_dump(exclude={"state", "scopes"}),
        code=secrets.token_urlsafe(32),
        scopes=scopes,
        client_id=pending.client_id,
        expires_at=time.time() + 120,
        subject=str(grant.id),
    )
    await save("code", code.code, code, 120)
    return construct_redirect_uri(str(params.redirect_uri), code=code.code, **redirect_args)


class BrowserOAuth:
    async def get_client(self, client_id: str) -> OAuthClientInformationFull | None:
        return await load("client", client_id, OAuthClientInformationFull)

    async def register_client(self, client_info: OAuthClientInformationFull) -> None:
        urls = client_info.redirect_uris or []
        if not urls or len(urls) > 8 or len({client_name(str(url)) for url in urls}) != 1:
            raise RegistrationError(
                "invalid_redirect_uri", "Нужен адрес возврата одного приложения"
            )
        if client_info.token_endpoint_auth_method not in {
            "client_secret_post",
            "client_secret_basic",
            "none",
        }:
            raise RegistrationError(
                "invalid_client_metadata", "Метод аутентификации не поддерживается"
            )
        assert client_info.client_id is not None
        await save("client", client_info.client_id, client_info, 365 * 86400)

    async def authorize(
        self, client: OAuthClientInformationFull, params: AuthorizationParams
    ) -> str:
        if params.resource not in (None, resource_url()):
            raise AuthorizeError("invalid_request", "Неизвестный ресурс")
        if not client.client_id or not re.fullmatch(r"[A-Za-z0-9_-]{43}", params.code_challenge):
            raise AuthorizeError("invalid_request", "Требуется PKCE S256")
        requested = params.scopes or (client.scope or " ".join(LEARNING)).split()
        if not set(requested).issubset(SCOPES):
            raise AuthorizeError("invalid_scope", "Неизвестные права")
        ticket = secrets.token_urlsafe(32)
        request = ConsentRequest(
            client_id=client.client_id,
            params=params.model_copy(update={"resource": resource_url(), "scopes": requested}),
        )
        await save("consent", ticket, request, 600)
        return get_settings().app_url.rstrip("/") + "/mcp/connect?request=" + ticket

    async def load_authorization_code(
        self, client: OAuthClientInformationFull, authorization_code: str
    ) -> AuthorizationCode | None:
        return await load("code", authorization_code, AuthorizationCode)

    async def exchange_authorization_code(
        self, client: OAuthClientInformationFull, authorization_code: AuthorizationCode
    ) -> OAuthToken:
        code = await load("code", authorization_code.code, AuthorizationCode, consume=True)
        if not code or code.client_id != client.client_id or not code.subject:
            raise TokenError("invalid_grant", "Код уже использован или истёк")
        return await self.issue(code.client_id, code.subject, code.scopes)

    async def issue(self, client_id: str, grant: str, scopes: list[str]) -> OAuthToken:
        async with get_session_factory()() as db:
            row = await db.get(ApiToken, UUID(grant))
            try:
                identity = await ApiTokenService(db).identity(row, mark_used=False)
            except UnauthorizedError as error:
                raise TokenError("invalid_grant", "Подключение отозвано или истекло") from error
            if not set(scopes).issubset(identity.scopes):
                raise TokenError("invalid_grant", "Права подключения изменились")
            assert row is not None
            remaining = max(1, int(row.expires_at.timestamp() - time.time()))
        ttl = min(3600, remaining)
        common = {
            "client_id": client_id,
            "scopes": scopes,
            "subject": grant,
            "resource": resource_url(),
        }
        access = AccessToken(
            token=secrets.token_urlsafe(40), expires_at=int(time.time()) + ttl, **common
        )
        refresh = RefreshToken(
            token=secrets.token_urlsafe(48), expires_at=int(time.time()) + remaining, **common
        )
        await save("access", access.token, access, ttl)
        await save("refresh", refresh.token, refresh, remaining)
        return OAuthToken(
            access_token=access.token,
            token_type="Bearer",
            expires_in=ttl,
            refresh_token=refresh.token,
            scope=" ".join(scopes),
        )

    async def load_refresh_token(
        self, client: OAuthClientInformationFull, refresh_token: str
    ) -> RefreshToken | None:
        return await load("refresh", refresh_token, RefreshToken)

    async def exchange_refresh_token(
        self, client: OAuthClientInformationFull, refresh_token: RefreshToken, scopes: list[str]
    ) -> OAuthToken:
        previous = await load("refresh", refresh_token.token, RefreshToken, consume=True)
        if not previous or previous.client_id != client.client_id or not previous.subject:
            raise TokenError("invalid_grant", "Повторный или просроченный обмен")
        return await self.issue(previous.client_id, previous.subject, scopes)

    async def load_access_token(self, token: str) -> AccessToken | None:
        access = await load("access", token, AccessToken)
        if not access or not access.subject or access.resource != resource_url():
            return None
        async with get_session_factory()() as db:
            try:
                identity = await ApiTokenService(db).identity(
                    await db.get(ApiToken, UUID(access.subject)), mark_used=False
                )
            except UnauthorizedError:
                return None
        return access if set(access.scopes).issubset(identity.scopes) else None

    async def revoke_token(self, token: AccessToken | RefreshToken) -> None:
        if token.subject:
            async with get_session_factory()() as db:
                row = await db.get(ApiToken, UUID(token.subject))
                if row is not None:
                    row.revoked_at = datetime.now(UTC)
                    await db.commit()
