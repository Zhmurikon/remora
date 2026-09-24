"""Регрессии по скриншотам: угловые скобки, атомарность и сохранность Unicode."""

import json
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from httpx import AsyncClient

from tests.test_agent_api import course_body, token
from tests.test_study import _auth


@pytest.mark.parametrize("value", ["pip install <package>", "`pip install <package>`", "List<T>"])
@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_agent_placeholder_rejection_and_code_recovery(
    mock_send: AsyncMock, client: AsyncClient, value: str
) -> None:
    headers, _ = await token(client, await _auth(client, "placeholder"))
    body = course_body()
    card = body["sections"][1]["articles"][0]["material"]["cards"][0]
    card["term"] = value
    response = await client.post("/api/v1/agent/courses", headers=headers, json=body)
    assert response.status_code == 409
    assert response.json()["message"] == "HTML-разметка в карточках не поддерживается"
    assert (await client.get("/api/v1/agent/courses", headers=headers)).json() == []
    assert (await client.get("/api/v1/agent/sets", headers=headers)).json() == []
    # Отклонённый запрос не занял ключ; правильный формат сохраняет исходный пример.
    card.update(content_type="code", code_language="bash")
    saved = await client.post("/api/v1/agent/courses", headers=headers, json=body)
    assert saved.status_code == 201
    assert saved.json()["sections"][1]["articles"][0]["material"]["cards"][0]["term"] == value


@pytest.mark.parametrize("ensure_ascii", [False, True])
@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_agent_utf8_and_json_escapes_roundtrip(
    mock_send: AsyncMock, client: AsyncClient, ensure_ascii: bool
) -> None:
    owner = await _auth(client, "unicode")
    headers, _ = await token(
        client, owner, scopes=["materials:read", "materials:write", "courses:publish"]
    )
    body = course_body()
    text = "Установка Python — ёлка, 中文, 😀"
    body["title"] = text
    body["description"] = text
    for section in body["sections"]:
        section["title"] = text
        for article in section["articles"]:
            article["title"] = text
            article["body"] = "# " + text + "\n\n`pip install <package>`"
            article["material"].update(title=text, description=text)
            article["material"]["cards"] = [{"term": text, "definition": text, "hint": text}]
    response = await client.post(
        "/api/v1/agent/courses",
        headers={**headers, "Content-Type": "application/json; charset=utf-8"},
        content=json.dumps(body, ensure_ascii=ensure_ascii).encode("utf-8"),
    )
    assert response.status_code == 201
    cid = response.json()["id"]
    saved = (await client.get(f"/api/v1/agent/courses/{cid}", headers=headers)).json()
    assert saved["title"] == saved["description"] == text
    for section in saved["sections"]:
        assert section["title"] == text
        for article in section["articles"]:
            assert article["title"] == text
            assert article["body"] == "# " + text + "\n\n`pip install <package>`"
            material = article["material"]
            assert material["title"] == material["description"] == text
            card = material["cards"][0]
            assert card["term"] == card["definition"] == card["hint"] == text
    headers["Idempotency-Key"] = str(uuid4())
    published = await client.post(f"/api/v1/agent/courses/{cid}/publish", headers=headers, json={})
    assert published.status_code == 200
    public = (await client.get(f"/api/v1/courses/public/{saved['slug']}")).json()
    assert public["title"] == public["description"] == text
