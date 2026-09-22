"""Загрузка изображений через персональный API и защита URL-источника."""

import base64
import socket
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import httpx
import pytest

from app.core.errors import ConflictError
from app.services import agent_media
from tests.test_agent_api import token
from tests.test_media import FakeStorage, _png
from tests.test_study import _auth


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_agent_uploads_base64_once_and_receives_markdown(
    mock_send: AsyncMock, client: httpx.AsyncClient
) -> None:
    owner = await _auth(client, "agentmedia")
    headers, _ = await token(client, owner)
    storage = FakeStorage(b"")
    body = {
        "data_base64": base64.b64encode(_png()).decode(),
        "filename": "diagram.png",
        "mime": "image/png",
        "alt": "Схема [урока]",
    }
    with patch("app.services.media.get_object_storage", return_value=storage):
        first = await client.post("/api/v1/agent/media", headers=headers, json=body)
        second = await client.post("/api/v1/agent/media", headers=headers, json=body)

    assert first.status_code == second.status_code == 201
    assert first.json() == second.json()
    assert first.json()["mime"] == "image/png"
    assert first.json()["width"] == 32
    assert first.json()["markdown_reference"] == (
        f"![Схема \\[урока\\]](media:{first.json()['id']})"
    )
    assert len(storage.puts) == 1


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_agent_media_requires_write_scope(
    mock_send: AsyncMock, client: httpx.AsyncClient
) -> None:
    headers, _ = await token(
        client, await _auth(client, "agentmediaread"), scopes=["materials:read"]
    )
    response = await client.post(
        "/api/v1/agent/media",
        headers=headers,
        json={"data_base64": base64.b64encode(_png()).decode(), "mime": "image/png"},
    )
    assert response.status_code == 403


@pytest.mark.parametrize(
    "url",
    [
        "https://127.0.0.1/image.png",
        "https://169.254.169.254/latest/meta-data",
        "https://10.0.0.1/image.png",
        "https://[::1]/image.png",
    ],
)
async def test_source_url_rejects_non_public_addresses(url: str) -> None:
    with pytest.raises(ConflictError, match="непубличный"):
        await agent_media._download_source(url, 1024)


async def test_source_url_downloads_public_image(monkeypatch: pytest.MonkeyPatch) -> None:
    ensure = AsyncMock()
    monkeypatch.setattr(agent_media, "_ensure_public_host", ensure)
    payload = _png()
    transport = httpx.MockTransport(
        lambda request: httpx.Response(
            200,
            headers={"Content-Type": "image/png", "Content-Length": str(len(payload))},
            content=payload,
        )
    )

    downloaded, mime, filename = await agent_media._download_source(
        "https://cdn.example/lesson/diagram.png?signature=x", 1_000_000, transport=transport
    )

    assert downloaded == payload
    assert mime == "image/png"
    assert filename == "diagram.png"
    ensure.assert_awaited_once_with("cdn.example", 443)


async def test_source_url_rejects_redirect(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(agent_media, "_ensure_public_host", AsyncMock())
    transport = httpx.MockTransport(
        lambda request: httpx.Response(302, headers={"Location": "https://other.example/a.png"})
    )
    with pytest.raises(ConflictError, match="Редиректы"):
        await agent_media._download_source(
            "https://cdn.example/a.png", 1_000_000, transport=transport
        )


async def test_hostname_resolving_to_private_address_is_rejected(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakeLoop:
        async def getaddrinfo(self, *args: object, **kwargs: object) -> list[tuple[object, ...]]:
            return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("10.0.0.8", 443))]

    monkeypatch.setattr(agent_media.asyncio, "get_running_loop", lambda: FakeLoop())
    with pytest.raises(ConflictError, match="непубличный"):
        await agent_media._ensure_public_host("internal.example", 443)


async def test_source_url_rejects_content_length_over_limit(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(agent_media, "_ensure_public_host", AsyncMock())
    transport = httpx.MockTransport(
        lambda request: httpx.Response(
            200, headers={"Content-Type": "image/png", "Content-Length": "1001"}, content=b"x"
        )
    )
    with pytest.raises(ConflictError, match="слишком большое"):
        await agent_media._download_source("https://cdn.example/a.png", 1000, transport=transport)


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_agent_rejects_invalid_base64_and_reuses_no_key(
    mock_send: AsyncMock, client: httpx.AsyncClient
) -> None:
    headers, _ = await token(client, await _auth(client, "agentmediabad"))
    response = await client.post(
        "/api/v1/agent/media",
        headers=headers,
        json={"data_base64": "not-base64", "mime": "image/png"},
    )
    assert response.status_code == 409
    headers["Idempotency-Key"] = str(uuid4())
    missing = await client.post(
        "/api/v1/agent/media",
        headers=headers,
        json={"data_base64": base64.b64encode(_png()).decode()},
    )
    assert missing.status_code == 422
