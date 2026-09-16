import json
import sqlite3
import zipfile
from io import BytesIO
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient

from app.core.errors import ConflictError
from app.services.anki_import import parse_anki
from app.worker import process_anki_import


class FakeImportStorage:
    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}

    async def put(self, key: str, payload: bytes, mime: str) -> None:
        self.objects[key] = payload

    async def read(self, key: str, max_bytes: int) -> tuple[bytes, int]:
        payload = self.objects[key]
        return payload, len(payload)

    async def delete(self, key: str) -> None:
        self.objects.pop(key, None)


def _collection(tmp_path: Path, fields: list[str]) -> bytes:
    path = tmp_path / "collection.anki2"
    connection = sqlite3.connect(path)
    connection.execute("CREATE TABLE notes (id INTEGER PRIMARY KEY, flds TEXT NOT NULL)")
    connection.executemany(
        "INSERT INTO notes (id, flds) VALUES (?, ?)",
        [(index, value) for index, value in enumerate(fields, start=1)],
    )
    connection.commit()
    connection.close()
    return path.read_bytes()


def _apkg(collection: bytes, media: dict[str, bytes] | None = None) -> bytes:
    output = BytesIO()
    with zipfile.ZipFile(output, "w") as archive:
        archive.writestr("collection.anki2", collection)
        mapping: dict[str, str] = {}
        for index, (name, payload) in enumerate((media or {}).items()):
            stored = str(index)
            mapping[stored] = name
            archive.writestr(stored, payload)
        archive.writestr("media", json.dumps(mapping))
    return output.getvalue()


def test_parse_anki_txt_directives_and_html() -> None:
    result = parse_anki(
        b"#separator:semicolon\n#html:true\n<strong>term</strong>;<div>definition</div>",
        "deck.txt",
    )
    assert [(card.term, card.definition) for card in result.cards] == [("term", "definition")]


def test_parse_apkg_cards_cloze_and_media(tmp_path: Path) -> None:
    collection = _collection(
        tmp_path,
        [
            '<img src="front.png">{{c1::memory::hint}}\x1fпамять<br>строка',
            "пустая заметка",
        ],
    )
    result = parse_anki(_apkg(collection, {"front.png": b"image"}), "deck.apkg")

    assert len(result.cards) == 1
    assert result.cards[0].term == "memory"
    assert result.cards[0].definition == "память\nстрока"
    assert result.cards[0].term_image == "front.png"
    assert result.media == {"front.png": b"image"}
    assert result.skipped_notes == 1


def test_parse_apkg_reports_audio_and_missing_media(tmp_path: Path) -> None:
    collection = _collection(
        tmp_path,
        ['<img src="missing.png">term\x1fdefinition[sound:voice.mp3]'],
    )
    result = parse_anki(_apkg(collection), "deck.apkg")

    assert result.skipped_media == 1
    assert result.warnings == ["Аудиовложений пропущено: 1"]


def test_rejects_invalid_apkg() -> None:
    with pytest.raises(ConflictError, match="повреждён"):
        parse_anki(b"not a zip", "deck.apkg")


def test_rejects_unknown_extension() -> None:
    with pytest.raises(ConflictError, match="Поддерживаются"):
        parse_anki(b"data", "deck.csv")


async def _register(client: AsyncClient, suffix: str) -> dict[str, str]:
    email = f"anki-{suffix}@example.com"
    await client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "Str0ngP@ss!",
            "username": f"anki{suffix}",
        },
    )
    response = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": "Str0ngP@ss!"}
    )
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


async def _create_set(client: AsyncClient, headers: dict[str, str]) -> str:
    response = await client.post(
        "/api/v1/sets",
        headers=headers,
        json={"title": "Импорт Anki", "lang_term": "en", "lang_definition": "ru"},
    )
    return str(response.json()["id"])


async def test_import_txt_appends_cards(client: AsyncClient) -> None:
    headers = await _register(client, "owner")
    set_id = await _create_set(client, headers)

    imported = await client.post(
        f"/api/v1/imports/sets/{set_id}/anki",
        params={"filename": "deck.txt"},
        headers={**headers, "Content-Type": "application/octet-stream"},
        content="memory\tпамять\nlearn\tучиться".encode(),
    )

    assert imported.status_code == 200
    assert imported.json()["imported_cards"] == 2
    study_set = await client.get(f"/api/v1/sets/{set_id}", headers=headers)
    assert [card["term"] for card in study_set.json()["cards"]] == ["memory", "learn"]


async def test_import_rejects_foreign_set(client: AsyncClient) -> None:
    owner = await _register(client, "first")
    stranger = await _register(client, "second")
    set_id = await _create_set(client, owner)

    response = await client.post(
        f"/api/v1/imports/sets/{set_id}/anki",
        params={"filename": "deck.txt"},
        headers={**stranger, "Content-Type": "application/octet-stream"},
        content=b"term\tdefinition",
    )

    assert response.status_code == 403
    assert response.json()["code"] == "FORBIDDEN"


async def test_background_job_status_is_isolated(client: AsyncClient) -> None:
    owner = await _register(client, "jobowner")
    stranger = await _register(client, "jobstranger")
    set_id = await _create_set(client, owner)
    storage = FakeImportStorage()

    with (
        patch("app.services.imports.get_object_storage", return_value=storage),
        patch("app.api.v1.imports.enqueue_import", new_callable=AsyncMock) as enqueue,
    ):
        created = await client.post(
            f"/api/v1/imports/sets/{set_id}/anki/jobs",
            params={"filename": "deck.txt"},
            headers={**owner, "Content-Type": "application/octet-stream"},
            content=b"term\tdefinition",
        )

    assert created.status_code == 202
    assert created.json()["status"] == "queued"
    assert created.json()["progress"] == 0
    enqueue.assert_awaited_once_with(created.json()["id"])
    job_id = created.json()["id"]
    assert (await client.get(f"/api/v1/imports/jobs/{job_id}", headers=owner)).status_code == 200
    listed = await client.get(f"/api/v1/imports/sets/{set_id}/jobs", headers=owner)
    assert [item["id"] for item in listed.json()] == [job_id]
    forbidden = await client.get(f"/api/v1/imports/jobs/{job_id}", headers=stranger)
    assert forbidden.status_code == 403
    assert forbidden.json()["code"] == "FORBIDDEN"


async def test_worker_completes_import_and_writes_report(client: AsyncClient) -> None:
    owner = await _register(client, "worker")
    set_id = await _create_set(client, owner)
    storage = FakeImportStorage()
    with (
        patch("app.services.imports.get_object_storage", return_value=storage),
        patch("app.api.v1.imports.enqueue_import", new_callable=AsyncMock),
    ):
        created = await client.post(
            f"/api/v1/imports/sets/{set_id}/anki/jobs",
            params={"filename": "deck.txt"},
            headers={**owner, "Content-Type": "application/octet-stream"},
            content=b"term\tdefinition\nbroken",
        )

    with patch("app.worker.get_object_storage", return_value=storage):
        await process_anki_import({}, created.json()["id"])

    status_response = await client.get(
        f"/api/v1/imports/jobs/{created.json()['id']}", headers=owner
    )
    body = status_response.json()
    assert body["status"] == "completed"
    assert body["progress"] == 100
    assert body["result"]["imported_cards"] == 1
    assert body["errors"] == [{"row": 2, "message": "Не найдено второе поле"}]
    assert not storage.objects
