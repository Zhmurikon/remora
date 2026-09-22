import asyncio
import base64
import json
import os
import socket
import sys
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
import uvicorn
from httpx import AsyncClient
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

from app import mcp_server
from app.main import create_app
from tests.test_agent_api import course_body, token
from tests.test_media import FakeStorage, _png
from tests.test_study import _auth

API_DIRECTORY = str(Path(__file__).resolve().parents[1])


async def test_mcp_to_api_creates_private_course(client: AsyncClient) -> None:
    headers, created = await token(client, await _auth(client, "mcpauthor"))
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        server = uvicorn.Server(uvicorn.Config(create_app(), lifespan="off", log_level="error"))
        running = asyncio.create_task(server.serve(sockets=[listener]))
        try:
            async with asyncio.timeout(10):
                # Uvicorn сообщает о готовности флагом, а не asyncio.Event.
                while not server.started:  # noqa: ASYNC110
                    await asyncio.sleep(0.01)
            params = StdioServerParameters(
                command=sys.executable,
                args=["-m", "app.mcp_server"],
                cwd=API_DIRECTORY,
                env={
                    **os.environ,
                    "REMORA_API_TOKEN": created["token"],
                    "REMORA_API_URL": f"http://127.0.0.1:{listener.getsockname()[1]}",
                },
            )
            async with stdio_client(params) as (read, write), ClientSession(read, write) as session:
                await session.initialize()
                for _ in range(2):
                    result = await session.call_tool(
                        "create_course", {"course": course_body(), "request_key": "mcp-course-1"}
                    )
                    assert not result.isError
                course = (await client.get("/api/v1/agent/courses", headers=headers)).json()[0]
                course_id = course["id"]
                result = await session.call_tool("get_course_structure", {"course_id": course_id})
                assert not result.isError
                structure = (
                    await client.get(
                        f"/api/v1/agent/courses/{course_id}/structure", headers=headers
                    )
                ).json()
                structure["sections"][0]["articles"][0]["body"] = "# Теория E6B"
                result = await session.call_tool(
                    "update_course_structure",
                    {
                        "course_id": course_id,
                        "structure": {
                            "revision": structure["revision"],
                            "sections": structure["sections"],
                        },
                        "request_key": "mcp-structure",
                    },
                )
                assert not result.isError
                result = await session.call_tool(
                    "copy_course",
                    {
                        "course_id": course_id,
                        "selection": {"article_id": structure["sections"][0]["articles"][0]["id"]},
                        "request_key": "mcp-copy",
                    },
                )
                assert not result.isError
                for kind, tool_name in [
                    ("articles", "delete_course_article"),
                    ("sections", "delete_course_section"),
                ]:
                    current = (
                        await client.get(
                            f"/api/v1/agent/courses/{course_id}/structure", headers=headers
                        )
                    ).json()
                    target = (
                        current["sections"][0]["articles"][0]["id"]
                        if kind == "articles"
                        else current["sections"][0]["id"]
                    )
                    result = await session.call_tool(
                        tool_name,
                        {
                            "course_id": course_id,
                            ("article_id" if kind == "articles" else "section_id"): target,
                            "deletion": {"revision": current["revision"], "confirm": True},
                            "request_key": "mcp-delete-" + kind,
                        },
                    )
                    assert not result.isError
            courses = (await client.get("/api/v1/agent/courses", headers=headers)).json()
            assert len(courses) == 2 and all(not c["is_published"] for c in courses)
        finally:
            server.should_exit = True
            await running


async def test_stdio_handshake_and_schemas() -> None:
    params = StdioServerParameters(
        command=sys.executable,
        args=["-m", "app.mcp_server"],
        cwd=API_DIRECTORY,
        env={**os.environ, "REMORA_API_TOKEN": "rmr_" + "x" * 64},
    )
    async with stdio_client(params) as (read, write), ClientSession(read, write) as session:
        await session.initialize()
        tools = (await session.list_tools()).tools
        assert len(tools) == 16
        create = next(t for t in tools if t.name == "create_course")
        assert "course" in create.inputSchema["properties"]
        upload = next(t for t in tools if t.name == "upload_image")
        assert "image" in upload.inputSchema["properties"]


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_mcp_uploads_base64_image(mock_send: AsyncMock, client: AsyncClient) -> None:
    owner = await _auth(client, "mcpmedia")
    _, created = await token(client, owner)
    storage = FakeStorage(b"")
    with (
        socket.socket() as listener,
        patch("app.services.media.get_object_storage", return_value=storage),
    ):
        listener.bind(("127.0.0.1", 0))
        server = uvicorn.Server(uvicorn.Config(create_app(), lifespan="off", log_level="error"))
        running = asyncio.create_task(server.serve(sockets=[listener]))
        try:
            async with asyncio.timeout(10):
                while not server.started:  # noqa: ASYNC110
                    await asyncio.sleep(0.01)
            params = StdioServerParameters(
                command=sys.executable,
                args=["-m", "app.mcp_server"],
                cwd=API_DIRECTORY,
                env={
                    **os.environ,
                    "REMORA_API_TOKEN": created["token"],
                    "REMORA_API_URL": f"http://127.0.0.1:{listener.getsockname()[1]}",
                },
            )
            async with stdio_client(params) as (read, write), ClientSession(read, write) as session:
                await session.initialize()
                result = await session.call_tool(
                    "upload_image",
                    {
                        "image": {
                            "data_base64": base64.b64encode(_png()).decode(),
                            "mime": "image/png",
                            "alt": "График",
                        },
                        "request_key": "mcp-media-1",
                    },
                )
                assert not result.isError
                data = json.loads(result.content[0].text)
                assert data["markdown_reference"].startswith("![График](media:")
                assert data["mime"] == "image/png"
        finally:
            server.should_exit = True
            await running


@pytest.mark.parametrize(
    "origin",
    [
        "http://example.com",
        "https://user:password@example.com",
        "https://example.com/path",
        "https://example.com?token=x",
    ],
)
def test_connector_rejects_unsafe_origin(origin: str, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("REMORA_API_URL", origin)
    with pytest.raises(ValueError):
        mcp_server.configuration()
