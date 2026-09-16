"""Полный экспорт аккаунта: архив, медиа, срок ссылки и права доступа."""

import json
from io import BytesIO
from unittest.mock import AsyncMock, patch
from uuid import uuid4
from zipfile import ZipFile

from httpx import AsyncClient
from sqlalchemy import select

from app.db.session import get_session_factory
from app.models.content import MediaAsset, MediaKind, MediaSource, MediaStatus
from app.models.user import User
from app.worker import process_account_export


class FakeStorage:
    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}

    async def put(self, key: str, payload: bytes, mime: str) -> None:
        self.objects[key] = payload

    async def read(self, key: str, max_bytes: int) -> tuple[bytes, int]:
        payload = self.objects[key]
        return payload, len(payload)

    async def delete(self, key: str) -> None:
        self.objects.pop(key, None)

    def download_url(self, key: str, ttl: int) -> str:
        return f"https://storage.test/{key}?ttl={ttl}"


async def _auth(client: AsyncClient, suffix: str) -> dict[str, str]:
    email = f"archive-{suffix}@example.com"
    await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "Str0ngP@ss!", "username": f"archive{suffix}"},
    )
    login = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": "Str0ngP@ss!"}
    )
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


async def _content(client: AsyncClient, headers: dict[str, str]) -> tuple[str, str]:
    created = await client.post("/api/v1/sets", headers=headers, json={"title": "Архив"})
    set_id = str(created.json()["id"])
    await client.put(
        f"/api/v1/sets/{set_id}/cards",
        headers=headers,
        json={"cards": [{"term": "memory", "definition": "память"}]},
    )
    session = await client.post(
        "/api/v1/study/sessions",
        headers=headers,
        json={"set_id": set_id, "mode": "flashcards"},
    )
    return set_id, str(session.json()["id"])


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_account_export_archive_and_email(
    _verification: AsyncMock, client: AsyncClient
) -> None:
    headers = await _auth(client, "owner")
    set_id, _session_id = await _content(client, headers)
    course = await client.post(
        "/api/v1/courses", headers=headers, json={"title": "Учебный курс", "set_id": set_id}
    )
    assert course.status_code == 201
    storage = FakeStorage()

    async with get_session_factory()() as db:
        user = await db.scalar(select(User).where(User.email == "archive-owner@example.com"))
        assert user is not None
        media = MediaAsset(
            owner_id=user.id,
            kind=MediaKind.image,
            s3_key=f"users/{user.id}/media/picture.png",
            mime="image/png",
            size_bytes=7,
            width=1,
            height=1,
            source=MediaSource.upload,
            status=MediaStatus.ready,
        )
        db.add(media)
        await db.commit()
        media_id = str(media.id)
        storage.objects[media.s3_key] = b"picture"

    with (
        patch("app.api.v1.users.enqueue_account_export", new_callable=AsyncMock) as enqueue,
        patch("app.services.account_exports.get_object_storage", return_value=storage),
    ):
        created = await client.post("/api/v1/users/me/export", headers=headers)
    assert created.status_code == 202
    enqueue.assert_awaited_once_with(created.json()["id"])

    with (
        patch("app.services.account_exports.get_object_storage", return_value=storage),
        patch("app.worker.send_account_export_email", new_callable=AsyncMock) as email,
    ):
        await process_account_export({}, created.json()["id"])
        status = await client.get(
            f"/api/v1/users/me/export/{created.json()['id']}", headers=headers
        )

    body = status.json()
    assert body["status"] == "completed"
    assert body["progress"] == 100
    assert body["download_url"].startswith("https://storage.test/")
    email.assert_awaited_once()

    archive_payload = next(value for key, value in storage.objects.items() if key.endswith(".zip"))
    with ZipFile(BytesIO(archive_payload)) as archive:
        assert set(archive.namelist()) == {
            "account.json",
            "sets.json",
            "learning.json",
            "preferences.json",
            "manifest.json",
            f"media/{media_id}.png",
        }
        account = json.loads(archive.read("account.json"))
        sets = json.loads(archive.read("sets.json"))
        learning = json.loads(archive.read("learning.json"))
        assert "password_hash" not in account
        assert sets["sets"][0]["id"] == set_id
        assert sets["cards"][0]["term"] == "memory"
        assert sets["courses"][0]["id"] == course.json()["id"]
        assert sets["course_articles"][0]["set_id"] == set_id
        assert len(sets["course_sections"]) == 1
        assert len(learning["study_sessions"]) == 1
        assert archive.read(f"media/{media_id}.png") == b"picture"


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_account_export_job_is_private_and_not_duplicated(
    _verification: AsyncMock, client: AsyncClient
) -> None:
    owner = await _auth(client, "first")
    stranger = await _auth(client, "second")
    with patch("app.api.v1.users.enqueue_account_export", new_callable=AsyncMock):
        created = await client.post("/api/v1/users/me/export", headers=owner)
        duplicate = await client.post("/api/v1/users/me/export", headers=owner)

    assert created.status_code == 202
    assert duplicate.status_code == 409
    forbidden = await client.get(
        f"/api/v1/users/me/export/{created.json()['id']}", headers=stranger
    )
    assert forbidden.status_code == 403
    assert forbidden.json()["code"] == "FORBIDDEN"
    assert (await client.get(f"/api/v1/users/me/export/{uuid4()}")).status_code == 401
