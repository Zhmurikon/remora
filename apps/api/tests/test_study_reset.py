from datetime import UTC, datetime, timedelta
from uuid import UUID

from httpx import AsyncClient
from sqlalchemy import func, select

from app.db.session import get_session_factory
from app.models.study import CardState, Review, StudySession
from tests.test_study import _auth, _review, _set_with_cards
from tests.test_test_mode import _create_test


async def test_reset_both_directions_keeps_history_and_other_sets(client: AsyncClient) -> None:
    headers = await _auth(client, "reset")
    first = await _set_with_cards(client, headers, 2)
    other = await _set_with_cards(client, headers, 1)
    set_id = first["id"]
    session = await client.post(
        "/api/v1/study/sessions", headers=headers, json={"set_id": set_id, "mode": "learn"}
    )
    session_id = session.json()["id"]
    old = _review(
        first["cards"][0]["id"], reviewed_at=(datetime.now(UTC) - timedelta(seconds=1)).isoformat()
    )
    reviews = [
        old,
        _review(first["cards"][0]["id"], direction="def_to_term"),
        _review(other["cards"][0]["id"]),
    ]
    answer = await client.post(
        "/api/v1/study/reviews",
        headers=headers,
        json={"session_id": session_id, "reviews": reviews},
    )
    assert len(answer.json()["accepted"]) == 3
    reset = await client.post(f"/api/v1/study/sets/{set_id}/reset", headers=headers)
    assert reset.status_code == 204, reset.text
    stats = (await client.get(f"/api/v1/study/sets/{set_id}/stats", headers=headers)).json()
    assert stats["not_started_count"] == 2
    assert stats["mastery_percent"] == stats["learning_count"] == stats["due_now"] == 0
    assert stats["last_studied_at"] is None and stats["problem_cards"] == []
    queue = (
        await client.get(
            f"/api/v1/study/sets/{set_id}/queue", headers=headers, params={"direction": "both"}
        )
    ).json()
    assert len(queue["items"]) == 4
    assert all(item["state"]["state"] == "new" for item in queue["items"])
    async with get_session_factory()() as db:
        assert await db.scalar(select(func.count()).select_from(Review)) == 3
        assert (
            await db.scalar(
                select(func.count())
                .select_from(CardState)
                .where(CardState.set_id == UUID(str(other["id"])))
            )
            == 1
        )
        stored_session = await db.get(StudySession, UUID(session_id))
        assert stored_session.status.value == "abandoned"
    # Повтор принятого ответа не восстанавливает состояние; старая вкладка тоже не может.
    late = _review(first["cards"][0]["id"])
    response = await client.post(
        "/api/v1/study/reviews",
        headers=headers,
        json={"session_id": session_id, "reviews": [old, late]},
    )
    assert response.json()["duplicates"] == [old["client_review_id"]]
    assert response.json()["rejected"] == [late["client_review_id"]]
    offline = _review(first["cards"][0]["id"], reviewed_at=old["reviewed_at"])
    response = await client.post(
        "/api/v1/study/reviews", headers=headers, json={"reviews": [offline]}
    )
    assert response.json()["rejected"] == [offline["client_review_id"]]
    # Новая тренировка после сброса снова пишет прогресс.
    new_session = await client.post(
        "/api/v1/study/sessions", headers=headers, json={"set_id": set_id, "mode": "learn"}
    )
    assert new_session.json()["id"] != session_id
    fresh = _review(first["cards"][0]["id"])
    response = await client.post(
        "/api/v1/study/reviews",
        headers=headers,
        json={"session_id": new_session.json()["id"], "reviews": [fresh]},
    )
    assert response.json()["accepted"] == [fresh["client_review_id"]]
    assert (
        await client.post(f"/api/v1/study/sets/{set_id}/reset", headers=headers)
    ).status_code == 204
    assert (
        await client.post(f"/api/v1/study/sets/{set_id}/reset", headers=headers)
    ).status_code == 204


async def test_reset_access_and_daily_allowance(client: AsyncClient) -> None:
    owner = await _auth(client, "resetowner")
    other = await _auth(client, "resetother")
    study_set = await _set_with_cards(client, owner, 1)
    set_id = study_set["id"]
    url = f"/api/v1/study/sets/{set_id}/reset"
    assert (await client.post(url)).status_code == 401
    assert (await client.post(url, headers=other)).status_code == 403
    await client.patch("/api/v1/study/settings", headers=owner, json={"new_cards_per_day": 1})
    await client.post(
        "/api/v1/study/reviews",
        headers=owner,
        json={"reviews": [_review(study_set["cards"][0]["id"])]},
    )
    assert (await client.post(url, headers=owner)).status_code == 204
    queue = (await client.get(f"/api/v1/study/sets/{set_id}/queue", headers=owner)).json()
    assert queue["new_left_today"] == 1 and len(queue["items"]) == 1
    assert (await client.get(f"/api/v1/sets/{set_id}", headers=owner)).json()["cards_count"] == 1


async def test_old_test_attempt_does_not_restore_progress(client: AsyncClient) -> None:
    headers = await _auth(client, "resettest")
    study_set = await _set_with_cards(client, headers, 1)
    set_id = str(study_set["id"])
    attempt = await _create_test(client, headers, set_id, question_count=1)
    assert (
        await client.post(f"/api/v1/study/sets/{set_id}/reset", headers=headers)
    ).status_code == 204
    result = await client.post(
        f"/api/v1/study/tests/{attempt['id']}/submit",
        headers=headers,
        json={
            "answers": [{"question_id": attempt["questions"][0]["id"], "value": "определение 0"}]
        },
    )
    assert result.status_code == 200 and result.json()["correct_count"] == 1
    stats = (await client.get(f"/api/v1/study/sets/{set_id}/stats", headers=headers)).json()
    assert stats["not_started_count"] == 1
