from uuid import uuid4

from httpx import AsyncClient

from tests.test_agent_api import course_body, token
from tests.test_study import _auth


async def test_edit_published_materials_in_place(client: AsyncClient) -> None:
    owner = await _auth(client, "pointowner")
    editor, _ = await token(client, owner, scopes=["materials:read", "materials:write"])
    foreign, _ = await token(client, await _auth(client, "pointother"))
    connect = "/api/v1/agent/connection"
    assert (await client.get(connect)).status_code == 401
    before = (await client.get(connect, headers=editor)).json()
    assert before["scopes"] == ["materials:read", "materials:write"]
    assert before["weekly_writes_remaining"] == 500
    body = course_body()
    cards = body["sections"][0]["articles"][0]["material"]["cards"]
    cards.append({"term": "Контроль", "definition": "Без изменений"})
    create = await client.post("/api/v1/agent/courses", headers=editor, json=body)
    assert create.status_code == 201, create.text
    course = create.json()
    assert course["is_published"]
    article = course["sections"][0]["articles"][0]
    deck = article["material"]
    course_path = "/api/v1/agent/courses/" + course["id"]
    set_path = "/api/v1/agent/sets/" + deck["id"]
    public = "/api/v1/courses/public/" + course["slug"]
    public_set = "/api/v1/sets/public/" + deck["slug"]
    original = deck["cards"]

    def headers():
        return {**editor, "Idempotency-Key": str(uuid4())}

    page = (
        await client.get(set_path + "/cards", params={"query": "контроль"}, headers=editor)
    ).json()
    assert page["cards"] == [original[-1]] and page["total"] == 1
    assert (await client.get(set_path + "/cards", headers=foreign)).status_code == 403
    card_path = set_path + "/cards/" + original[-1]["id"]
    edit = {"revision": page["revision"], "changes": {"definition": "Поправлено"}}
    assert (await client.patch(card_path, headers=foreign, json=edit)).status_code == 403
    key = headers()
    first = await client.patch(card_path, headers=key, json=edit)
    assert first.status_code == 200, first.text
    assert first.json()["card_ids"] == [original[-1]["id"]]
    assert (await client.patch(card_path, headers=key, json=edit)).json() == first.json()
    assert (await client.patch(card_path, headers=headers(), json=edit)).status_code == 409
    revision = first.json()["revision"]
    another = course["sections"][1]["articles"][0]["material"]["cards"][0]["id"]
    missing = await client.patch(
        set_path + "/cards/" + another, headers=headers(), json={**edit, "revision": revision}
    )
    assert missing.status_code == 404
    batch = {"revision": revision, "cards": [{"term": "Три", "definition": "3"}]}
    assert (await client.post(set_path + "/cards", headers=foreign, json=batch)).status_code == 403
    key = headers()
    append = await client.post(set_path + "/cards", headers=key, json=batch)
    assert append.status_code == 200, append.text
    assert (await client.post(set_path + "/cards", headers=key, json=batch)).json() == append.json()
    folder = (
        await client.post("/api/v1/agent/folders", headers=headers(), json={"title": "Для занятий"})
    ).json()
    move = {"folder_id": folder["id"], "revision": append.json()["revision"]}
    assert (await client.post(set_path + "/move", headers=foreign, json=move)).status_code == 403
    moved = await client.post(set_path + "/move", headers=headers(), json=move)
    assert moved.status_code == 200 and moved.json()["folder_id"] == folder["id"]
    current = (await client.get(course_path + "/structure", headers=editor)).json()
    current["sections"][0]["articles"][0]["body"] = "Исправленная теория"
    saved = await client.put(
        course_path + "/structure",
        headers=headers(),
        json={"revision": current["revision"], "sections": current["sections"]},
    )
    assert saved.status_code == 200
    public_course = (await client.get(public)).json()
    assert public_course["is_published"]
    assert public_course["sections"][0]["articles"][0]["body"] == "Исправленная теория"
    public_cards = (await client.get(public_set)).json()["cards"]
    assert public_cards[-2]["id"] == original[-1]["id"]
    assert public_cards[-2]["definition"] == "Поправлено"
    assert public_cards[-1]["id"] == append.json()["card_ids"][0]
    saved_cards = (await client.get(set_path, headers=editor)).json()["cards"]
    assert saved_cards[:-2] == original[:-1]
    old_card, changed_card = original[-1].copy(), saved_cards[-2].copy()
    assert changed_card.pop("updated_at") >= old_card.pop("updated_at")
    assert changed_card == {**old_card, "definition": "Поправлено"}
    after = (await client.get(connect, headers=editor)).json()
    assert after["weekly_writes_used"] - before["weekly_writes_used"] == 6
    assert after["weekly_writes_remaining"] == 494
