"""HTTP MCP использует те же инструменты и обработчики API с правами текущего запроса."""

from urllib.parse import parse_qs, urlsplit
from uuid import UUID

import httpx
from fastapi import FastAPI
from mcp.server.auth.middleware.auth_context import get_access_token
from mcp.server.auth.routes import create_protected_resource_routes
from mcp.server.auth.settings import AuthSettings, ClientRegistrationOptions
from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings
from pydantic import AnyHttpUrl
from remora_mcp.server import INSTRUCTIONS, host_client, register_host_tools
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.types import Message, Receive, Scope, Send

from app.core.config import get_settings
from app.core.errors import RateLimitError
from app.core.rate_limit import enforce_rate_limit
from app.services.mcp_oauth import LEARNING, SCOPES, BrowserOAuth, resource_url

ISSUER_PATH = "/api/mcp/oauth"
DISCOVERY = "/.well-known/oauth-authorization-server"
ROUTES = {
    "/mcp": "/mcp",
    DISCOVERY + ISSUER_PATH: DISCOVERY,
    **{ISSUER_PATH + path: path for path in ("/authorize", "/register", "/token")},
}


def mount_remote(app: FastAPI) -> FastMCP:
    origin = get_settings().web_url.rstrip("/")
    server = FastMCP(
        "Запоминальня",
        instructions=INSTRUCTIONS,
        stateless_http=True,
        json_response=True,
        auth_server_provider=BrowserOAuth(),
        auth=AuthSettings(
            issuer_url=AnyHttpUrl(origin + ISSUER_PATH),
            resource_server_url=AnyHttpUrl(resource_url()),
            validate_token_resource=True,
            client_registration_options=ClientRegistrationOptions(
                enabled=True,
                valid_scopes=list(SCOPES),
                default_scopes=list(LEARNING),
            ),
        ),
        transport_security=TransportSecuritySettings(
            enable_dns_rebinding_protection=True,
            allowed_hosts=[urlsplit(origin).netloc],
            allowed_origins=[origin, "https://chatgpt.com", "https://claude.ai"],
        ),
    )
    register_host_tools(server)
    remote = server.streamable_http_app()

    def client() -> httpx.AsyncClient:
        access = get_access_token()
        if access is None or not access.subject or access.resource != resource_url():
            raise ValueError("Требуется вход в Запоминальню")
        grant = (UUID(access.subject), frozenset(access.scopes))

        async def delegated(scope: Scope, receive: Receive, send: Send) -> None:
            # Право передаётся только внутри ASGI. HTTP-заголовок не может заполнить это поле.
            await app({**scope, "remora.oauth_grant": grant}, receive, send)

        return httpx.AsyncClient(
            transport=httpx.ASGITransport(app=delegated),
            base_url="http://agent.internal",
            follow_redirects=False,
            trust_env=False,
        )

    async def hosted(scope: Scope, receive: Receive, send: Send) -> None:
        path = ROUTES.get(scope.get("path", ""))
        if path is None:
            await JSONResponse({"detail": "Not Found"}, 404)(scope, receive, send)
            return
        scope = {**scope, "path": path, "raw_path": path.encode("ascii")}
        if path in {"/register", "/authorize", "/token"}:
            request = Request(scope, receive)
            try:
                await enforce_rate_limit(
                    scope="mcp-oauth" + request.url.path,
                    ip=request.client.host if request.client else "",
                    identity="",
                    limit=60,
                    window_seconds=60,
                )
            except RateLimitError:
                await JSONResponse(
                    {"error": "temporarily_unavailable"},
                    status_code=429,
                    headers={"Retry-After": "60"},
                )(scope, receive, send)
                return
            if request.method == "POST" and request.url.path == "/token":
                chunks = bytearray()
                async for chunk in request.stream():
                    if len(chunks) + len(chunk) > 65536:
                        await JSONResponse({"error": "invalid_request"}, 413)(scope, receive, send)
                        return
                    chunks.extend(chunk)
                form = parse_qs(chunks.decode("utf-8", errors="replace"), keep_blank_values=True)
                if form.get("resource", [resource_url()]) != [resource_url()]:
                    await JSONResponse({"error": "invalid_target"}, 400)(scope, receive, send)
                    return
                original_receive = receive
                sent = False

                async def replay() -> Message:
                    nonlocal sent
                    if sent:
                        return await original_receive()
                    sent = True
                    return {"type": "http.request", "body": bytes(chunks), "more_body": False}

                receive = replay
        marker = host_client.set(client)
        try:
            await remote(scope, receive, send)
        finally:
            host_client.reset(marker)

    # Выданные права проверяются для конкретной команды. Клиенту при этом нужен
    # список доступных разрешений до первого входа.
    app.router.routes.extend(
        create_protected_resource_routes(
            AnyHttpUrl(resource_url()),
            [AnyHttpUrl(origin + ISSUER_PATH)],
            scopes_supported=list(LEARNING),
            resource_name="Запоминальня",
        )
    )
    app.mount("/", hosted)
    return server
