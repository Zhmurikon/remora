from unittest.mock import AsyncMock

import pytest
from httpx import AsyncClient

from app.core.config import get_settings


@pytest.mark.asyncio
async def test_transcription_internal_api_requires_server_token(client: AsyncClient) -> None:
    response = await client.post(
        "/api/v1/internal/transcriptions",
        json={
            "filename": "recording.ts",
            "content_type": "video/mp2t",
            "size_bytes": 3,
            "total_parts": 1,
        },
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_transcription_upload_is_chunked_and_queued(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    storage = AsyncMock()
    monkeypatch.setattr("app.services.transcriptions.get_object_storage", lambda: storage)
    enqueue = AsyncMock()
    monkeypatch.setattr("app.api.v1.transcriptions.enqueue_transcription", enqueue)
    headers = {"X-Transcriber-Token": get_settings().secret_key}

    created = await client.post(
        "/api/v1/internal/transcriptions",
        headers=headers,
        json={
            "filename": "recording.ts",
            "content_type": "video/mp2t",
            "size_bytes": 3,
            "total_parts": 1,
            "language": "ru",
        },
    )
    assert created.status_code == 201
    job_id = created.json()["id"]

    uploaded = await client.put(
        f"/api/v1/internal/transcriptions/{job_id}/parts/0",
        headers={**headers, "Content-Type": "application/octet-stream"},
        content=b"abc",
    )
    assert uploaded.status_code == 200
    assert uploaded.json()["uploaded_parts"] == 1
    storage.put.assert_awaited_once()

    completed = await client.post(
        f"/api/v1/internal/transcriptions/{job_id}/complete", headers=headers
    )
    assert completed.status_code == 200
    assert completed.json()["status"] == "queued"
    enqueue.assert_awaited_once_with(job_id)

