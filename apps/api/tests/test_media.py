"""Загрузка изображений и изоляция медиа пользователей."""

from io import BytesIO
from unittest.mock import AsyncMock, patch

import pytest
from PIL import Image


class FakeStorage:
    def __init__(self, payload: bytes) -> None:
        self.payload = payload
        self.deleted: list[str] = []

    def upload_url(self, key: str, mime: str, ttl: int) -> str:
        return f"http://storage.test/{key}?upload=1"

    def download_url(self, key: str, ttl: int) -> str:
        return f"http://storage.test/{key}?download=1"

    async def read(self, key: str, max_bytes: int) -> tuple[bytes, int]:
        return self.payload, len(self.payload)

    async def delete(self, key: str) -> None:
        self.deleted.append(key)


async def _auth(client: pytest.fixture, suffix: str) -> dict[str, str]:
    email = f"media-{suffix}@example.com"
    await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "Str0ngP@ss!", "username": f"media{suffix}"},
    )
    login = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": "Str0ngP@ss!"}
    )
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


def _png() -> bytes:
    buffer = BytesIO()
    Image.new("RGB", (32, 24), "lime").save(buffer, format="PNG")
    return buffer.getvalue()


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_upload_image_and_attach_to_card(
    mock_send: AsyncMock, client: pytest.fixture
) -> None:
    storage = FakeStorage(_png())
    headers = await _auth(client, "owner")
    with patch("app.services.media.get_object_storage", return_value=storage):
        ticket = await client.post(
            "/api/v1/media/upload-url",
            headers=headers,
            json={"filename": "term.png", "mime": "image/png", "size_bytes": len(storage.payload)},
        )
        assert ticket.status_code == 201
        asset_id = ticket.json()["id"]
        completed = await client.post(f"/api/v1/media/{asset_id}/complete", headers=headers)
        assert completed.status_code == 200
        assert completed.json()["width"] == 32
        assert completed.json()["height"] == 24
        assert completed.json()["download_url"].startswith("http://storage.test/")

        study_set = await client.post("/api/v1/sets", headers=headers, json={"title": "Фото"})
        saved = await client.put(
            f"/api/v1/sets/{study_set.json()['id']}/cards",
            headers=headers,
            json={
                "cards": [
                    {
                        "term": "Лист",
                        "definition": "Leaf",
                        "term_image_id": asset_id,
                    }
                ]
            },
        )
        assert saved.status_code == 200
        assert saved.json()["cards"][0]["term_image_id"] == asset_id


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_user_cannot_read_or_attach_another_users_image(
    mock_send: AsyncMock, client: pytest.fixture
) -> None:
    storage = FakeStorage(_png())
    owner = await _auth(client, "first")
    stranger = await _auth(client, "second")
    with patch("app.services.media.get_object_storage", return_value=storage):
        ticket = await client.post(
            "/api/v1/media/upload-url",
            headers=owner,
            json={"filename": "private.png", "mime": "image/png", "size_bytes": 100},
        )
        asset_id = ticket.json()["id"]
        await client.post(f"/api/v1/media/{asset_id}/complete", headers=owner)
        assert (await client.get(f"/api/v1/media/{asset_id}", headers=stranger)).status_code == 403

        study_set = await client.post(
            "/api/v1/sets", headers=stranger, json={"title": "Чужая картинка"}
        )
        attached = await client.put(
            f"/api/v1/sets/{study_set.json()['id']}/cards",
            headers=stranger,
            json={
                "cards": [
                    {"term": "Нет", "definition": "Доступа", "term_image_id": asset_id}
                ]
            },
        )
        assert attached.status_code == 409


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_rejects_file_disguised_as_image(
    mock_send: AsyncMock, client: pytest.fixture
) -> None:
    storage = FakeStorage(b"this is not a png")
    headers = await _auth(client, "invalid")
    with patch("app.services.media.get_object_storage", return_value=storage):
        ticket = await client.post(
            "/api/v1/media/upload-url",
            headers=headers,
            json={"filename": "fake.png", "mime": "image/png", "size_bytes": 17},
        )
        completed = await client.post(
            f"/api/v1/media/{ticket.json()['id']}/complete", headers=headers
        )
        assert completed.status_code == 409
        assert storage.deleted
