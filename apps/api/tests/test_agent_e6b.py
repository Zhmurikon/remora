"""Агентские операции E6B используют права токена и общие гарантии редактора."""

from copy import deepcopy
from uuid import uuid4

from httpx import AsyncClient

from tests.test_agent_api import course_body, token
from tests.test_study import _auth


async def test_agent_structure_copy_delete_and_permissions(client: AsyncClient) -> None:
    owner = await _auth(client, "e6bowner")
    headers, _ = await token(client, owner)
    reader, _ = await token(client, owner, scopes=["materials:read"])
    stranger, _ = await token(client, await _auth(client, "e6bstranger"))
    original = (
        await client.post("/api/v1/agent/courses", headers=headers, json=course_body())
    ).json()
    path = f"/api/v1/agent/courses/{original['id']}"
    current = (await client.get(path + "/structure", headers=headers)).json()
    assert (await client.get(path + "/structure", headers=stranger)).status_code == 403
    structure = {"revision": current["revision"], "sections": deepcopy(current["sections"])}
    structure["sections"][0]["articles"][0]["body"] = "# Новая теория\n\n**Важно**"
    headers["Idempotency-Key"] = str(uuid4())
    assert (
        await client.put(path + "/structure", headers=reader, json=structure)
    ).status_code == 403
    assert (
        await client.put(path + "/structure", headers=stranger, json=structure)
    ).status_code == 403
    saved = await client.put(path + "/structure", headers=headers, json=structure)
    assert saved.status_code == 200, saved.text
    assert (
        await client.put(path + "/structure", headers=headers, json=structure)
    ).json() == saved.json()
    full = (await client.get(path, headers=headers)).json()
    assert (
        full["sections"][0]["articles"][0]["material"]["cards"]
        == original["sections"][0]["articles"][0]["material"]["cards"]
    )
    headers["Idempotency-Key"] = str(uuid4())
    assert (
        await client.put(path + "/structure", headers=headers, json=structure)
    ).status_code == 409
    assert (
        await client.put(
            path + "/structure",
            headers=headers,
            json={"revision": saved.json()["revision"], "sections": []},
        )
    ).status_code == 409
    article = saved.json()["sections"][0]["articles"][0]
    deletion = {"revision": saved.json()["revision"], "confirm": True}
    delete_path = path + f"/articles/{article['id']}/delete"
    assert (await client.post(delete_path, headers=reader, json=deletion)).status_code == 403
    assert (await client.post(delete_path, headers=stranger, json=deletion)).status_code == 403
    assert (
        await client.post(delete_path, headers=headers, json={**deletion, "confirm": False})
    ).status_code == 422
    assert (
        await client.post(
            delete_path, headers=headers, json={**deletion, "revision": current["revision"]}
        )
    ).status_code == 409
    response = await client.post(delete_path, headers=headers, json=deletion)
    assert response.status_code == 200, response.text
    assert (
        await client.post(delete_path, headers=headers, json=deletion)
    ).json() == response.json()
    assert (
        await client.get(f"/api/v1/agent/sets/{article['set_id']}", headers=headers)
    ).status_code == 200
    assert response.json()["sections"][0]["articles"] == []
    remaining = response.json()
    headers["Idempotency-Key"] = str(uuid4())
    section_id = remaining["sections"][1]["id"]
    response = await client.post(
        path + f"/sections/{section_id}/delete",
        headers=headers,
        json={"revision": remaining["revision"], "confirm": True},
    )
    assert response.status_code == 200
    assert len(response.json()["sections"]) == 1
    headers["Idempotency-Key"] = str(uuid4())
    assert (await client.post(path + "/copy", headers=reader, json={})).status_code == 403
    assert (await client.post(path + "/copy", headers=stranger, json={})).status_code == 404
    copied = await client.post(path + "/copy", headers=headers, json={})
    assert copied.status_code == 201 and not copied.json()["is_published"]
    assert (await client.post(path + "/copy", headers=headers, json={})).json() == copied.json()


async def test_agent_copy_public_article_and_publication_blocks_delete(client: AsyncClient) -> None:
    owner = await _auth(client, "e6bpublic")
    headers, _ = await token(client, owner)
    other, _ = await token(client, await _auth(client, "e6bcopy"))
    created = (
        await client.post("/api/v1/agent/courses", headers=headers, json=course_body())
    ).json()
    path = f"/api/v1/agent/courses/{created['id']}"
    await client.post(f"/api/v1/courses/{created['id']}/publish", headers=owner, json={})
    structure = (await client.get(path + "/structure", headers=headers)).json()
    article = structure["sections"][0]["articles"][0]
    copied = await client.post(path + "/copy", headers=other, json={"article_id": article["id"]})
    assert copied.status_code == 201
    assert len(copied.json()["sections"]) == 1
    new_article = copied.json()["sections"][0]["articles"][0]
    assert new_article["set_id"] != article["set_id"]
    assert new_article["body"] == article["body"]
    headers["Idempotency-Key"] = str(uuid4())
    response = await client.post(
        path + f"/articles/{article['id']}/delete",
        headers=headers,
        json={"revision": structure["revision"], "confirm": True},
    )
    assert response.status_code == 409
    await client.post(f"/api/v1/courses/{created['id']}/unpublish", headers=owner)
    other["Idempotency-Key"] = str(uuid4())
    assert (await client.post(path + "/copy", headers=other, json={})).status_code == 404
    assert (
        await client.get(f"/api/v1/agent/courses/{copied.json()['id']}", headers=other)
    ).status_code == 200
