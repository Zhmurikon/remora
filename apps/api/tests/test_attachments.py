"""Вложения курса: права, лимит размера и физическое удаление."""

from httpx import AsyncClient

from app.services import attachments as attachment_module
from tests.test_courses import auth


class FakeStorage:
    def __init__(self) -> None:
        self.deleted: list[str] = []
        self.object_size = 1024

    def upload_url(self, key: str, mime: str, ttl: int) -> str:
        return f"https://storage.test/upload/{key}"

    def attachment_download_url(self, key: str, filename: str, ttl: int) -> str:
        return f"https://storage.test/download/{key}?name={filename}"

    async def size(self, key: str) -> int:
        return self.object_size

    async def delete(self, key: str) -> None:
        self.deleted.append(key)

    async def delete_many(self, keys: list[str]) -> None:
        self.deleted.extend(keys)


async def test_attachment_upload_download_delete_and_access(
    client: AsyncClient, monkeypatch
) -> None:
    storage = FakeStorage()
    monkeypatch.setattr(attachment_module, "get_object_storage", lambda: storage)
    owner = await auth(client, "attachment-owner")
    reader = await auth(client, "attachment-reader")
    study_set = (
        await client.post("/api/v1/sets", headers=owner, json={"title": "Материал"})
    ).json()
    await client.put(
        f"/api/v1/sets/{study_set['id']}/cards",
        headers=owner,
        json={"cards": [{"term": "Термин", "definition": "Определение"}]},
    )
    course = (
        await client.post(
            "/api/v1/courses",
            headers=owner,
            json={"title": "Курс", "set_id": study_set["id"]},
        )
    ).json()
    article_id = course["sections"][0]["articles"][0]["id"]
    base = f"/api/v1/courses/{course['id']}/attachments"

    too_large = await client.post(
        base + "/upload-url",
        headers=owner,
        json={"filename": "large.bin", "mime": "application/octet-stream", "size_bytes": 104857601},
    )
    assert too_large.status_code == 409
    assert too_large.json()["details"]["max_size_bytes"] == 104857600
    assert (
        await client.post(
            base + "/upload-url",
            headers=reader,
            json={"filename": "notes.txt", "mime": "text/plain", "size_bytes": 1024},
        )
    ).status_code == 403

    ticket = await client.post(
        base + "/upload-url",
        headers=owner,
        json={
            "filename": "конспект.txt",
            "mime": "text/plain",
            "size_bytes": 1024,
            "article_id": article_id,
        },
    )
    assert ticket.status_code == 201
    attachment_id = ticket.json()["id"]
    completed = await client.post(base + f"/{attachment_id}/complete", headers=owner)
    assert completed.status_code == 200
    assert completed.json()["article_id"] == article_id
    assert (await client.get(base)).status_code == 401
    assert (await client.get(base, headers=reader)).status_code == 403

    await client.post(f"/api/v1/courses/{course['id']}/publish", headers=owner, json={})
    readable = await client.get(f"/api/v1/courses/{course['id']}", headers=reader)
    assert readable.status_code == 200
    assert readable.json()["can_edit"] is False
    listed = await client.get(base, headers=reader)
    assert [item["filename"] for item in listed.json()] == ["конспект.txt"]
    download = await client.get(base + f"/{attachment_id}/download", headers=reader)
    assert download.status_code == 200
    assert "конспект.txt" in download.json()["url"]

    assert (await client.delete(base + f"/{attachment_id}", headers=reader)).status_code == 403
    assert (await client.delete(base + f"/{attachment_id}", headers=owner)).status_code == 204
    assert len(storage.deleted) == 1
    assert (await client.get(base, headers=owner)).json() == []
