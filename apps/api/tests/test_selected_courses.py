from uuid import uuid4

import pytest

from tests.test_courses import auth


async def test_selected_order_duplicates_missing_and_unpublished(client):
    headers = await auth(client, "curator")
    ids = []
    for title in ("Первый", "Второй"):
        response = await client.post("/api/v1/sets", headers=headers, json={"title": title})
        set_id = response.json()["id"]
        await client.put(
            f"/api/v1/sets/{set_id}/cards", headers=headers,
            json={"cards": [{"term": title, "definition": "Ответ", "position": 0}]},
        )
        response = await client.post(
            "/api/v1/courses", headers=headers, json={"title": title, "set_id": set_id},
        )
        course_id = response.json()["id"]
        response = await client.post(
            f"/api/v1/courses/{course_id}/publish", headers=headers, json={"tags": []},
        )
        assert response.status_code == 200
        ids.append(course_id)
    params = [("ids", value) for value in [ids[1], str(uuid4()), ids[0], ids[1]]]
    response = await client.get("/api/v1/search/courses/selected", params=params)
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert [item["id"] for item in response.json()] == [ids[1], ids[0]]
    assert "content" not in response.json()[0]
    response = await client.post(f"/api/v1/courses/{ids[1]}/unpublish", headers=headers)
    assert response.status_code == 200
    response = await client.get("/api/v1/search/courses/selected", params=params)
    assert [item["id"] for item in response.json()] == [ids[0]]


@pytest.mark.parametrize("ids", [[], ["invalid"], [str(uuid4())] * 51])
async def test_selected_limits(client, ids):
    response = await client.get(
        "/api/v1/search/courses/selected", params=[("ids", value) for value in ids]
    )
    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_ERROR"
