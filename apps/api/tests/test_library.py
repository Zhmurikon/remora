"""Связанные сохранения дают обучение, но не владение оригиналом."""

from datetime import UTC, datetime
from uuid import uuid4

from httpx import AsyncClient

from tests.test_courses import auth


async def _published_course(client: AsyncClient, owner: dict[str, str]) -> dict:
    created = await client.post("/api/v1/sets", headers=owner, json={"title": "Материал"})
    study_set = created.json()
    cards = await client.put(
        f"/api/v1/sets/{study_set['id']}/cards",
        headers=owner,
        json={"cards": [{"term": "A", "definition": "B"}]},
    )
    course = (
        await client.post(
            "/api/v1/courses", headers=owner, json={"title": "Курс", "set_id": study_set["id"]}
        )
    ).json()
    await client.post(f"/api/v1/courses/{course['id']}/publish", headers=owner, json={})
    course["set"] = cards.json()
    return course


async def test_course_save_grants_study_but_not_edit_and_revokes_on_unpublish(
    client: AsyncClient,
) -> None:
    owner = await auth(client, "library-owner")
    learner = await auth(client, "library-learner")
    course = await _published_course(client, owner)
    set_id = course["set"]["id"]

    unavailable = await client.get(f"/api/v1/study/sets/{set_id}/queue", headers=learner)
    assert unavailable.status_code == 403
    saved = await client.post(
        "/api/v1/library",
        headers=learner,
        json={"target_type": "course", "target_id": course["id"]},
    )
    assert saved.status_code == 201, saved.text
    assert saved.json()["cards_count"] == 1
    assert len((await client.get("/api/v1/library", headers=learner)).json()) == 1
    repeated = await client.post(
        "/api/v1/library",
        headers=learner,
        json={"target_type": "course", "target_id": course["id"]},
    )
    assert repeated.json()["id"] == saved.json()["id"]

    queue = await client.get(f"/api/v1/study/sets/{set_id}/queue", headers=learner)
    assert queue.status_code == 200
    edit = await client.put(
        f"/api/v1/sets/{set_id}/cards",
        headers=learner,
        json={"cards": [{"term": "Чужая правка", "definition": "Запрещена"}]},
    )
    assert edit.status_code == 403
    card_id = course["set"]["cards"][0]["id"]
    reviewed = await client.post(
        "/api/v1/study/reviews",
        headers=learner,
        json={
            "reviews": [
                {
                    "client_review_id": str(uuid4()),
                    "card_id": card_id,
                    "direction": "term_to_def",
                    "mode": "learn",
                    "rating": 3,
                    "answer_correct": True,
                    "duration_ms": 100,
                    "reviewed_at": datetime.now(tz=UTC).isoformat(),
                }
            ]
        },
    )
    assert len(reviewed.json()["accepted"]) == 1
    owner_stats = await client.get(f"/api/v1/study/sets/{set_id}/stats", headers=owner)
    learner_stats = await client.get(f"/api/v1/study/sets/{set_id}/stats", headers=learner)
    assert owner_stats.json()["learning_count"] == 0
    assert learner_stats.json()["learning_count"] == 1

    changed_cards = {
        "cards": [
            {"id": card_id, "term": "A обновлено", "definition": "B"},
            {"term": "Новая", "definition": "Карточка"},
        ]
    }
    assert (
        await client.put(
            f"/api/v1/sets/{set_id}/cards", headers=owner, json=changed_cards
        )
    ).status_code == 200
    library_item = (await client.get("/api/v1/library", headers=learner)).json()[0]
    assert library_item["has_updates"] is True
    old_queue = await client.get(
        f"/api/v1/study/sets/{set_id}/queue",
        headers=learner,
        params={"scope": "all", "shuffle": "false"},
    )
    assert [item["card"]["term"] for item in old_queue.json()["items"]] == ["A"]
    changes = await client.get(
        f"/api/v1/library/{saved.json()['id']}/changes", headers=learner
    )
    assert changes.json()["cards_added"] == 1
    assert changes.json()["cards_changed"] == 1
    accepted = await client.post(
        f"/api/v1/library/{saved.json()['id']}/accept", headers=learner
    )
    assert accepted.json()["has_updates"] is False
    new_queue = await client.get(
        f"/api/v1/study/sets/{set_id}/queue",
        headers=learner,
        params={"scope": "all", "shuffle": "false"},
    )
    assert [item["card"]["term"] for item in new_queue.json()["items"]] == [
        "A обновлено",
        "Новая",
    ]
    learner_after = await client.get(f"/api/v1/study/sets/{set_id}/stats", headers=learner)
    assert learner_after.json()["learning_count"] == 1

    await client.post(f"/api/v1/courses/{course['id']}/unpublish", headers=owner)
    revoked = await client.get(f"/api/v1/study/sets/{set_id}/queue", headers=learner)
    assert revoked.status_code == 403
    assert (await client.get("/api/v1/library", headers=learner)).json() == []


async def test_article_and_set_saves_are_separate_and_protected(client: AsyncClient) -> None:
    owner = await auth(client, "library-target-owner")
    learner = await auth(client, "library-target-learner")
    stranger = await auth(client, "library-target-stranger")
    course = await _published_course(client, owner)
    article_id = course["sections"][0]["articles"][0]["id"]
    set_id = course["set"]["id"]

    article = await client.post(
        "/api/v1/library",
        headers=learner,
        json={"target_type": "article", "target_id": article_id},
    )
    saved_set = await client.post(
        "/api/v1/library",
        headers=learner,
        json={"target_type": "set", "target_id": set_id},
    )
    assert article.status_code == saved_set.status_code == 201
    public = await client.get(f"/api/v1/courses/public/{course['slug']}")
    assert public.json()["saves_count"] == 2
    state_response = await client.get(
        f"/api/v1/library/courses/{course['slug']}/state", headers=learner
    )
    state = state_response.json()
    assert state["saved_article_ids"] == [article_id]
    assert state["saved_set_ids"] == [set_id]
    forbidden_delete = await client.delete(
        f"/api/v1/library/{article.json()['id']}", headers=stranger
    )
    assert forbidden_delete.status_code == 404
    deleted = await client.delete(f"/api/v1/library/{article.json()['id']}", headers=learner)
    assert deleted.status_code == 204
    assert len((await client.get("/api/v1/library", headers=learner)).json()) == 1
    own = await client.post(
        "/api/v1/library",
        headers=owner,
        json={"target_type": "course", "target_id": course["id"]},
    )
    assert own.status_code == 403
