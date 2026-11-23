import base64
import hashlib
import json
import secrets
from urllib.parse import parse_qs, urlsplit

import pytest
from httpx import ASGITransport, AsyncClient
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client

from app.core.config import get_settings
from app.main import create_app
from tests.test_study import _auth


@pytest.mark.parametrize(
    ("name", "callback"),
    [
        ("Claude", "https://claude.ai/api/mcp/auth_callback"),
        ("ChatGPT", "https://chatgpt.com/connector/oauth/test-local"),
    ],
)
async def test_browser_connection(client: AsyncClient, name: str, callback: str) -> None:
    scopes = ["materials:read", "materials:write"] if name == "ChatGPT" else ["materials:read"]
    owner = await _auth(client, "browser")
    origin = get_settings().web_url.rstrip("/")
    app = create_app()
    async with (
        app.router.lifespan_context(app),
        AsyncClient(transport=ASGITransport(app=app), base_url=origin) as http,
    ):
        protected = await http.post("/mcp")
        assert protected.status_code == 401
        discovery = "/.well-known/oauth-protected-resource/mcp"
        assert discovery in protected.headers["WWW-Authenticate"]
        resource = (await http.get(discovery)).json()
        assert set(scopes).issubset(resource["scopes_supported"])
        issuer = resource["authorization_servers"][0]
        metadata = (
            await http.get("/.well-known/oauth-authorization-server" + urlsplit(issuer).path)
        ).json()
        assert metadata["issuer"] == issuer
        registered = await http.post(
            metadata["registration_endpoint"],
            json={
                "redirect_uris": [callback],
                "token_endpoint_auth_method": "client_secret_post",
                "grant_types": ["authorization_code", "refresh_token"],
                "response_types": ["code"],
            },
        )
        assert registered.status_code == 201
        credentials = registered.json()
        verifier = secrets.token_urlsafe(48)
        challenge = (
            base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest())
            .rstrip(b"=")
            .decode()
        )
        params = {
            "response_type": "code",
            "client_id": credentials["client_id"],
            "redirect_uri": callback,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
            "resource": resource["resource"],
            "scope": "materials:read materials:write",
            "state": "sample",
        }

        async def consent(allow: bool):
            authorize = await http.get(metadata["authorization_endpoint"], params=params)
            assert authorize.is_redirect
            location = urlsplit(authorize.headers["Location"])
            assert location.path.endswith("/mcp/connect")
            ticket = parse_qs(location.query)["request"][0]
            url = "/api/v1/mcp/consent/" + ticket
            assert (await http.get(url)).status_code == 401
            info = (await http.get(url, headers=owner)).json()
            assert info == {"client": name, "scopes": ["materials:read", "materials:write"]}
            response = await http.post(url, headers=owner, json={"allow": allow, "scopes": scopes})
            assert response.status_code == 200
            redirect = response.json()["redirect_uri"]
            assert redirect.split("?")[0] == callback
            return parse_qs(urlsplit(redirect).query)

        assert await consent(False) == {"state": ["sample"], "error": ["access_denied"]}
        accepted = await consent(True)
        token_url = metadata["token_endpoint"]
        client_auth = {k: credentials[k] for k in ("client_id", "client_secret")}
        exchange = await http.post(
            token_url,
            data={
                **client_auth,
                "code": accepted["code"][0],
                "grant_type": "authorization_code",
                "redirect_uri": callback,
                "code_verifier": verifier,
                "resource": resource["resource"],
            },
        )
        assert exchange.status_code == 200
        pair = exchange.json()
        assert pair["scope"].split() == scopes
        async with (
            AsyncClient(
                transport=ASGITransport(app=app),
                base_url=origin,
                headers={"Authorization": "Bearer " + pair["access_token"]},
            ) as authed,
            streamable_http_client(resource["resource"], http_client=authed) as (r, w, _),
            ClientSession(r, w) as session,
        ):
            await session.initialize()
            assert len((await session.list_tools()).tools) == 32
            result = await session.call_tool("check_connection", {})
            assert not result.isError, result.content
            data = json.loads(result.content[0].text)
            assert data["scopes"] == scopes and data["weekly_writes_remaining"] == 500
            creation = await session.call_tool(
                "create_set",
                {
                    "request_key": "test-create",
                    "material": {
                        "title": "Набор для проверки",
                        "cards": [{"term": "A", "definition": "B"}],
                    },
                },
            )
            assert creation.isError == ("materials:write" not in scopes)
            if not creation.isError:
                deck = json.loads(creation.content[0].text)
                edit = await session.call_tool(
                    "update_card",
                    {
                        "request_key": "test-edit",
                        "set_id": deck["id"],
                        "card_id": deck["cards"][0]["id"],
                        "edit": {"revision": deck["revision"], "changes": {"definition": "C"}},
                    },
                )
                assert not edit.isError
                page = await session.call_tool(
                    "list_set_cards", {"set_id": deck["id"], "query": "C"}
                )
                assert json.loads(page.content[0].text)["cards"][0]["id"] == deck["cards"][0]["id"]
        refresh = {
            **client_auth,
            "grant_type": "refresh_token",
            "refresh_token": pair["refresh_token"],
        }
        refreshed = await http.post(token_url, data=refresh)
        assert (
            refreshed.status_code == 200
            and refreshed.json()["refresh_token"] != pair["refresh_token"]
        )
        assert (await http.post(token_url, data=refresh)).status_code == 400
        grants = (await http.get("/api/v1/users/me/api-tokens", headers=owner)).json()
        grant = next(g for g in grants if g["name"] == "MCP · " + name)
        await http.delete("/api/v1/users/me/api-tokens/" + grant["id"], headers=owner)
        assert (
            await http.post("/mcp", headers={"Authorization": "Bearer " + pair["access_token"]})
        ).status_code == 401
