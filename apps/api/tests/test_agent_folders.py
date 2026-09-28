from uuid import uuid4

from httpx import AsyncClient

from tests.test_agent_api import token
from tests.test_study import _auth


async def test_agent_manages_folders_and_assigns_set(client: AsyncClient) -> None:
    owner = await _auth(client, "agentfolders")
    headers, _ = await token(client, owner)

    created = await client.post(
        "/api/v1/agent/folders",
        headers=headers,
        json={"title": "Языки", "color": "blue"},
    )
    assert created.status_code == 201
    folder = created.json()
    assert folder["title"] == "Языки" and len(folder["revision"]) == 64

    headers["Idempotency-Key"] = str(uuid4())
    nested = (
        await client.post(
            "/api/v1/agent/folders",
            headers=headers,
            json={"title": "Немецкий", "color": "violet", "parent_id": folder["id"]},
        )
    ).json()
    listed = (await client.get("/api/v1/agent/folders", headers=headers)).json()
    assert [item["id"] for item in listed] == [folder["id"], nested["id"]]

    headers["Idempotency-Key"] = str(uuid4())
    study_set = (
        await client.post(
            "/api/v1/agent/sets",
            headers=headers,
            json={"title": "Слова", "folder_id": nested["id"]},
        )
    ).json()
    assert study_set["folder_id"] == nested["id"]

    headers["Idempotency-Key"] = str(uuid4())
    updated = await client.put(
        f"/api/v1/agent/folders/{nested['id']}",
        headers=headers,
        json={
            "title": "Deutsch",
            "color": "orange",
            "parent_id": folder["id"],
            "position": 4,
            "revision": nested["revision"],
        },
    )
    assert updated.status_code == 200 and updated.json()["position"] == 4

    headers["Idempotency-Key"] = str(uuid4())
    deleted = await client.post(
        f"/api/v1/agent/folders/{nested['id']}/delete",
        headers=headers,
        json={"revision": updated.json()["revision"], "confirm": True},
    )
    assert deleted.status_code == 200
    assert (await client.get(f"/api/v1/agent/sets/{study_set['id']}", headers=headers)).json()[
        "folder_id"
    ] is None


async def test_agent_folder_permissions_revisions_and_idempotency(client: AsyncClient) -> None:
    owner = await _auth(client, "agentfolderowner")
    other = await _auth(client, "agentfolderother")
    headers, _ = await token(client, owner)
    other_headers, _ = await token(client, other)
    body = {"title": "Личное", "color": "rose"}

    first = await client.post("/api/v1/agent/folders", headers=headers, json=body)
    repeat = await client.post("/api/v1/agent/folders", headers=headers, json=body)
    assert first.status_code == repeat.status_code == 201
    assert first.json() == repeat.json()
    folder = first.json()
    assert (await client.get("/api/v1/agent/folders", headers=other_headers)).json() == []

    other_headers["Idempotency-Key"] = str(uuid4())
    forbidden = await client.post(
        f"/api/v1/agent/folders/{folder['id']}/delete",
        headers=other_headers,
        json={"revision": folder["revision"], "confirm": True},
    )
    assert forbidden.status_code == 403

    headers["Idempotency-Key"] = str(uuid4())
    stale = await client.put(
        f"/api/v1/agent/folders/{folder['id']}",
        headers=headers,
        json={**body, "position": 0, "revision": "0" * 64},
    )
    assert stale.status_code == 409 and stale.json()["details"]["reason"] == "stale_revision"

    headers["Idempotency-Key"] = str(uuid4())
    invalid = await client.post(
        f"/api/v1/agent/folders/{folder['id']}/delete",
        headers=headers,
        json={"revision": folder["revision"], "confirm": False},
    )
    assert invalid.status_code == 422
