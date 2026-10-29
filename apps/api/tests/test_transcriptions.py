from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, Mock

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.core.config import get_settings
from app.db.session import get_session_factory
from app.models.billing import Entitlement, EntitlementSource
from app.models.transcriptions import TranscriptionJob, TranscriptionStatus
from app.models.user import User


async def register(client: AsyncClient, suffix: str) -> tuple[dict[str, str], str]:
    email = f"transcription-{suffix}@example.com"
    response = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "Str0ngP@ss!", "username": f"speech-{suffix}"},
    )
    assert response.status_code == 201
    login = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": "Str0ngP@ss!"}
    )
    return {"Authorization": f"Bearer {login.json()['access_token']}"}, email


async def set_transcription_limit(email: str, value: int) -> None:
    async with get_session_factory()() as db:
        user = await db.scalar(select(User).where(User.email == email))
        assert user is not None
        db.add(
            Entitlement(
                user_id=user.id,
                key="limit.ai.transcription_minutes_per_week",
                value=value,
                source=EntitlementSource.admin,
                reason="Проверка пользовательской расшифровки",
                starts_at=datetime.now(UTC) - timedelta(minutes=1),
            )
        )
        await db.commit()


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
    assert created.json()["provider"] == "faster_whisper"
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


@pytest.mark.asyncio
async def test_transcription_accepts_yandex_provider(client: AsyncClient) -> None:
    headers = {"X-Transcriber-Token": get_settings().secret_key}
    created = await client.post(
        "/api/v1/internal/transcriptions",
        headers=headers,
        json={
            "filename": "lecture.mp4",
            "content_type": "video/mp4",
            "size_bytes": 4,
            "total_parts": 1,
            "provider": "yandex_speechkit",
            "language": "ru",
        },
    )

    assert created.status_code == 201
    assert created.json()["provider"] == "yandex_speechkit"


@pytest.mark.asyncio
async def test_free_user_gets_weekly_limit_error(client: AsyncClient) -> None:
    headers, _ = await register(client, "free")
    response = await client.post(
        "/api/v1/transcriptions",
        headers=headers,
        json={
            "filename": "lecture.mp4",
            "content_type": "video/mp4",
            "size_bytes": 4,
            "total_parts": 1,
            "duration_seconds": 61,
            "language": "ru",
        },
    )
    assert response.status_code == 402
    assert response.json()["code"] == "LIMIT_EXCEEDED"
    assert response.json()["details"]["limit_key"] == "ai.transcription_minutes_per_week"
    assert response.json()["details"]["requested"] == 2
    assert response.json()["details"]["resets_at"] is not None


@pytest.mark.asyncio
async def test_user_transcription_rejects_inconsistent_chunk_count(client: AsyncClient) -> None:
    headers, email = await register(client, "parts")
    await set_transcription_limit(email, 10)
    response = await client.post(
        "/api/v1/transcriptions",
        headers=headers,
        json={
            "filename": "lecture.mp4",
            "content_type": "video/mp4",
            "size_bytes": 4,
            "total_parts": 2,
            "duration_seconds": 60,
            "language": "ru",
        },
    )
    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_ERROR"


@pytest.mark.asyncio
async def test_user_transcriptions_are_private_and_metered(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    storage = AsyncMock()
    storage.create_multipart_upload.return_value = "upload-first"
    monkeypatch.setattr("app.services.transcriptions.get_object_storage", lambda: storage)
    first_headers, first_email = await register(client, "first")
    second_headers, second_email = await register(client, "second")
    await set_transcription_limit(first_email, 10)
    await set_transcription_limit(second_email, 10)

    created = await client.post(
        "/api/v1/transcriptions",
        headers=first_headers,
        json={
            "filename": "lecture.mp4",
            "content_type": "video/mp4",
            "size_bytes": 4,
            "total_parts": 1,
            "duration_seconds": 61,
            "language": "ru",
        },
    )
    assert created.status_code == 201
    assert created.json()["title"] == "lecture"
    job_id = created.json()["id"]

    mine = await client.get("/api/v1/transcriptions", headers=first_headers)
    assert [item["id"] for item in mine.json()] == [job_id]
    assert (await client.get("/api/v1/transcriptions", headers=second_headers)).json() == []
    assert (
        await client.get(f"/api/v1/transcriptions/{job_id}", headers=second_headers)
    ).status_code == 404
    assert (
        await client.get(f"/api/v1/transcriptions/{job_id}/upload", headers=second_headers)
    ).status_code == 404
    assert (
        await client.post(
            f"/api/v1/transcriptions/{job_id}/upload/parts",
            headers=second_headers,
            json={"part_numbers": [1]},
        )
    ).status_code == 404

    entitlements = await client.get("/api/v1/billing/entitlements", headers=first_headers)
    assert entitlements.json()["usage"]["ai.transcription_minutes_per_week"] == 2
    assert entitlements.json()["remaining"]["ai.transcription_minutes_per_week"] == 8
    assert entitlements.json()["resets_at"]["ai.transcription_minutes_per_week"] is not None


@pytest.mark.asyncio
async def test_user_can_upload_edit_and_delete_own_transcription(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    headers, email = await register(client, "lifecycle")
    await set_transcription_limit(email, 10)
    storage = AsyncMock()
    storage.create_multipart_upload.return_value = "upload-lifecycle"
    storage.upload_part_url = Mock(return_value="https://storage.example/upload-part")
    storage.list_multipart_parts.return_value = [
        {"part_number": 1, "size_bytes": 4, "etag": '"etag-1"'}
    ]
    storage.size.return_value = 4
    monkeypatch.setattr("app.services.transcriptions.get_object_storage", lambda: storage)
    enqueue = AsyncMock()
    monkeypatch.setattr("app.api.v1.transcriptions.enqueue_transcription", enqueue)
    created = await client.post(
        "/api/v1/transcriptions",
        headers=headers,
        json={
            "filename": "lecture.mp4",
            "content_type": "video/mp4",
            "size_bytes": 4,
            "total_parts": 1,
            "duration_seconds": 59,
        },
    )
    job_id = created.json()["id"]
    upload_state = await client.get(f"/api/v1/transcriptions/{job_id}/upload", headers=headers)
    assert upload_state.status_code == 200
    assert upload_state.json()["uploaded_parts"] == [{"part_number": 1, "size_bytes": 4}]
    signed = await client.post(
        f"/api/v1/transcriptions/{job_id}/upload/parts",
        headers=headers,
        json={"part_numbers": [1]},
    )
    assert signed.status_code == 200
    assert signed.json() == [{"part_number": 1, "url": "https://storage.example/upload-part"}]
    completed = await client.post(f"/api/v1/transcriptions/{job_id}/complete", headers=headers)
    assert completed.status_code == 200
    storage.complete_multipart_upload.assert_awaited_once()
    enqueue.assert_awaited_once_with(job_id)

    async with get_session_factory()() as db:
        job = await db.get(TranscriptionJob, created.json()["id"])
        assert job is not None
        job.status = TranscriptionStatus.completed
        job.result_text = "Исходный текст"
        await db.commit()

    updated = await client.patch(
        f"/api/v1/transcriptions/{job_id}",
        headers=headers,
        json={"title": "Новая лекция", "result_text": "Исправленный текст"},
    )
    assert updated.status_code == 200
    assert updated.json()["title"] == "Новая лекция"
    assert updated.json()["result_text"] == "Исправленный текст"
    deleted = await client.delete(f"/api/v1/transcriptions/{job_id}", headers=headers)
    assert deleted.status_code == 204
    missing = await client.get(f"/api/v1/transcriptions/{job_id}", headers=headers)
    assert missing.status_code == 404


@pytest.mark.asyncio
async def test_user_can_cancel_multipart_upload_and_release_quota(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    headers, email = await register(client, "cancel")
    await set_transcription_limit(email, 10)
    storage = AsyncMock()
    storage.create_multipart_upload.return_value = "upload-cancel"
    monkeypatch.setattr("app.services.transcriptions.get_object_storage", lambda: storage)

    created = await client.post(
        "/api/v1/transcriptions",
        headers=headers,
        json={
            "filename": "cancelled.ts",
            "content_type": "video/mp2t",
            "size_bytes": 4,
            "total_parts": 1,
            "duration_seconds": 61,
        },
    )
    assert created.status_code == 201

    deleted = await client.delete(
        f"/api/v1/transcriptions/{created.json()['id']}", headers=headers
    )
    assert deleted.status_code == 204
    storage.abort_multipart_upload.assert_awaited_once_with(
        f"transcriptions/{created.json()['id']}/source", "upload-cancel"
    )
    entitlements = await client.get("/api/v1/billing/entitlements", headers=headers)
    assert entitlements.json()["usage"]["ai.transcription_minutes_per_week"] == 0
    assert entitlements.json()["remaining"]["ai.transcription_minutes_per_week"] == 10
