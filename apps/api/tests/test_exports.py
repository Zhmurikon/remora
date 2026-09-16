"""Экспорт наборов: форматы, обратный импорт и изоляция пользователей."""

import csv
from io import StringIO
from unittest.mock import AsyncMock, patch

from httpx import AsyncClient

from app.services.anki_import import parse_anki


async def _auth(client: AsyncClient, suffix: str) -> dict[str, str]:
    await client.post(
        "/api/v1/auth/register",
        json={
            "email": f"export-{suffix}@example.com",
            "password": "Str0ngP@ss!",
            "username": f"export{suffix}",
        },
    )
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": f"export-{suffix}@example.com", "password": "Str0ngP@ss!"},
    )
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


async def _set(client: AsyncClient, headers: dict[str, str]) -> str:
    created = await client.post("/api/v1/sets", headers=headers, json={"title": "Языки"})
    set_id = str(created.json()["id"])
    await client.put(
        f"/api/v1/sets/{set_id}/cards",
        headers=headers,
        json={
            "cards": [
                {"term": "memory", "definition": "память"},
                {"term": "line\nbreak", "definition": 'кавычка, "да"'},
            ]
        },
    )
    return set_id


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_text_csv_and_anki_exports(_mock_send: AsyncMock, client: AsyncClient) -> None:
    headers = await _auth(client, "formats")
    set_id = await _set(client, headers)

    txt = await client.get(
        f"/api/v1/sets/{set_id}/export",
        headers=headers,
        params={"format": "txt", "side_separator": " :: ", "card_separator": "\n---\n"},
    )
    assert txt.status_code == 200
    assert txt.text == 'memory :: память\n---\nline\nbreak :: "кавычка, ""да"""'
    assert "attachment" in txt.headers["content-disposition"]

    exported_csv = await client.get(
        f"/api/v1/sets/{set_id}/export", headers=headers, params={"format": "csv"}
    )
    rows = list(csv.reader(StringIO(exported_csv.content.decode("utf-8-sig"))))
    assert rows == [
        ["Термин", "Определение"],
        ["memory", "память"],
        ["line\nbreak", 'кавычка, "да"'],
    ]

    anki = await client.get(
        f"/api/v1/sets/{set_id}/export", headers=headers, params={"format": "anki"}
    )
    parsed = parse_anki(anki.content, "export.txt")
    assert [(card.term, card.definition) for card in parsed.cards] == [
        ("memory", "память"),
        ("line\nbreak", 'кавычка, "да"'),
    ]


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_pdf_layouts_and_access(_mock_send: AsyncMock, client: AsyncClient) -> None:
    owner = await _auth(client, "owner")
    stranger = await _auth(client, "stranger")
    set_id = await _set(client, owner)

    for layout in ("double_sided", "foldable"):
        response = await client.get(
            f"/api/v1/sets/{set_id}/export",
            headers=owner,
            params={"format": "pdf", "layout": layout},
        )
        assert response.status_code == 200
        assert response.content.startswith(b"%PDF-")

    forbidden = await client.get(
        f"/api/v1/sets/{set_id}/export", headers=stranger, params={"format": "csv"}
    )
    assert forbidden.status_code == 403
    assert forbidden.json()["code"] == "FORBIDDEN"
    assert (
        await client.get(f"/api/v1/sets/{set_id}/export", params={"format": "txt"})
    ).status_code == 401
