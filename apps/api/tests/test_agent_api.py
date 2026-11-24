import asyncio
from copy import deepcopy
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

from httpx import AsyncClient

from app.db.session import get_session_factory
from app.models.api_tokens import ApiToken
from app.models.study import CardState, StudyDirection
from app.models.tts import UsageCounter
from app.models.user import User, UserStatus
from app.services.entitlements import week_period
from app.services.scheduler import SCHEDULER_VERSION
from tests.test_study import _auth


async def test_suspended_or_deleted_account_cannot_use_token(client: AsyncClient) -> None:
    owner = await _auth(client, "agentstatus")
    headers, created = await token(client, owner)
    async with get_session_factory()() as db:
        stored = await db.get(ApiToken, UUID(created["id"]))
        user = await db.get(User, stored.user_id)
        user.status = UserStatus.suspended
        await db.commit()
    assert (await client.get("/api/v1/agent/sets", headers=headers)).status_code == 401
    async with get_session_factory()() as db:
        user = await db.get(User, stored.user_id)
        user.status = UserStatus.active
        user.deleted_at = datetime.now(UTC)
        await db.commit()
    assert (await client.get("/api/v1/agent/sets", headers=headers)).status_code == 401


async def test_concurrent_retry_and_stale_editor_revision(client: AsyncClient) -> None:
    owner = await _auth(client, "agentconcurrent")
    headers, _ = await token(client, owner)
    body = {"title": "Набор", "cards": [{"term": "A", "definition": "B"}]}
    first, second = await asyncio.gather(
        *[client.post("/api/v1/agent/sets", headers=headers, json=body) for _ in range(2)]
    )
    assert first.status_code == second.status_code == 201
    assert first.json() == second.json()
    saved = first.json()
    assert len((await client.get("/api/v1/agent/sets", headers=headers)).json()) == 1
    assert (await client.get("/api/v1/agent/sets?offset=1&limit=1", headers=headers)).json() == []
    update = {**body, "revision": saved["revision"]}
    update["cards"][0]["id"] = saved["cards"][0]["id"]
    headers["Idempotency-Key"] = str(uuid4())
    edited = await client.put(f"/api/v1/agent/sets/{saved['id']}", headers=headers, json=update)
    assert edited.status_code == 200 and edited.json()["cards"][0]["id"] == saved["cards"][0]["id"]
    # Обычный редактор тоже делает прочитанную агентом версию устаревшей.
    changed = await client.patch(
        f"/api/v1/sets/{saved['id']}", headers=owner, json={"title": "Из кабинета"}
    )
    assert changed.status_code == 200
    headers["Idempotency-Key"] = str(uuid4())
    response = await client.put(
        f"/api/v1/agent/sets/{saved['id']}",
        headers=headers,
        json={**update, "revision": edited.json()["revision"]},
    )
    assert response.status_code == 409


async def token(
    client: AsyncClient, owner: dict[str, str], **kwargs: Any
) -> tuple[dict[str, str], dict[str, Any]]:
    response = await client.post(
        "/api/v1/users/me/api-tokens", headers=owner, json={"name": "Агент", **kwargs}
    )
    assert response.status_code == 201, response.text
    data = response.json()
    return {"Authorization": f"Bearer {data['token']}", "Idempotency-Key": str(uuid4())}, data


def course_body() -> dict[str, Any]:
    return {
        "title": "Алгебра",
        "sections": [
            {
                "title": title,
                "articles": [
                    {
                        "title": "Теория",
                        "body": "Конспект. Источник: заметки пользователя.",
                        "material": {
                            "title": title,
                            "cards": [
                                {
                                    "term": title,
                                    "definition": "Верно",
                                    "wrong_definition_answers": ["Неверно"],
                                    "wrong_term_answers": ["Полином"],
                                }
                            ],
                        },
                    }
                ],
            }
            for title in ["Векторы", "Матрицы"]
        ],
    }


async def test_tokens_scopes_revocation_and_isolation(client: AsyncClient) -> None:
    owner, other = await _auth(client, "patowner"), await _auth(client, "patother")
    headers, created = await token(client, owner, scopes=["materials:read"])
    listed = (await client.get("/api/v1/users/me/api-tokens", headers=owner)).json()
    assert len(listed) == 1 and "token" not in listed[0] and "token_hash" not in listed[0]
    assert (await client.get("/api/v1/users/me/api-tokens", headers=other)).json() == []
    assert (
        await client.delete(f"/api/v1/users/me/api-tokens/{created['id']}", headers=other)
    ).status_code == 404
    assert (await client.get("/api/v1/agent/sets", headers=headers)).status_code == 200
    assert (
        await client.post("/api/v1/agent/sets", headers=headers, json={"title": "X"})
    ).status_code == 403
    assert (await client.get("/api/v1/auth/me", headers=headers)).status_code == 401
    assert (await client.get("/api/v1/agent/sets", headers=owner)).status_code == 401
    assert (
        await client.delete(f"/api/v1/users/me/api-tokens/{created['id']}", headers=owner)
    ).status_code == 204
    assert (await client.get("/api/v1/agent/sets", headers=headers)).status_code == 401
    headers, created = await token(client, owner)
    async with get_session_factory()() as db:
        stored = await db.get(ApiToken, UUID(created["id"]))
        assert stored and stored.token_hash != created["token"]
        stored.expires_at = datetime.now(UTC) - timedelta(seconds=1)
        await db.commit()
    assert (await client.get("/api/v1/agent/sets", headers=headers)).status_code == 401


async def test_course_atomic_create_update_and_access(client: AsyncClient) -> None:
    owner = await _auth(client, "agentowner")
    headers, _ = await token(client, owner)
    body = course_body()
    response = await client.post("/api/v1/agent/courses", headers=headers, json=body)
    assert response.status_code == 201, response.text
    course = response.json()
    assert course["is_published"] and len(course["sections"]) == 2
    assert course["sections"][0]["articles"][0]["material"]["cards"][0][
        "wrong_definition_answers"
    ] == ["Неверно"]
    assert course["sections"][0]["articles"][0]["material"]["cards"][0]["wrong_term_answers"] == [
        "Полином"
    ]
    repeat = await client.post("/api/v1/agent/courses", headers=headers, json=body)
    assert repeat.json() == course
    assert (
        await client.post("/api/v1/agent/courses", headers=headers, json={**body, "title": "Иное"})
    ).status_code == 409
    url = f"/api/v1/agent/courses/{course['id']}"
    stranger, _ = await token(client, await _auth(client, "agentother"))
    assert (await client.get(url, headers=stranger)).status_code == 403
    set_id = course["sections"][0]["articles"][0]["material"]["id"]
    assert (await client.get(f"/api/v1/agent/sets/{set_id}", headers=stranger)).status_code == 403
    update = deepcopy(body)
    update["revision"] = course["revision"]
    for section, saved in zip(update["sections"], course["sections"], strict=True):
        section["id"] = saved["id"]
        section["articles"][0]["id"] = saved["articles"][0]["id"]
        section["articles"][0]["material"]["cards"][0]["id"] = saved["articles"][0]["material"][
            "cards"
        ][0]["id"]
    update["sections"].reverse()
    headers["Idempotency-Key"] = str(uuid4())
    changed = await client.put(url, headers=headers, json=update)
    assert changed.status_code == 200, changed.text
    assert changed.json()["sections"][0]["title"] == "Матрицы"
    headers["Idempotency-Key"] = str(uuid4())
    assert (await client.put(url, headers=headers, json=update)).status_code == 409
    assert (
        await client.post(url + "/publish", headers=headers, json={"tags": ["алгебра"]})
    ).status_code == 403
    pub, _ = await token(client, owner, scopes=["courses:publish"])
    assert (
        await client.post(url + "/publish", headers=pub, json={"tags": ["алгебра"]})
    ).status_code == 200
    update["revision"] = (await client.get(url, headers=headers)).json()["revision"]
    headers["Idempotency-Key"] = str(uuid4())
    assert (await client.put(url, headers=headers, json=update)).status_code == 200


async def test_course_rollback_and_card_validation(client: AsyncClient) -> None:
    headers, _ = await token(client, await _auth(client, "rollbackagent"))
    body = course_body()
    body["sections"][1]["articles"][0]["material"]["cards"][0]["term_image_id"] = str(uuid4())
    response = await client.post("/api/v1/agent/courses", headers=headers, json=body)
    assert response.status_code == 409, response.text
    assert (await client.get("/api/v1/agent/courses", headers=headers)).json() == []
    assert (await client.get("/api/v1/agent/sets", headers=headers)).json() == []
    # Неуспешная операция не занимает ключ повтора.
    response = await client.post("/api/v1/agent/courses", headers=headers, json=course_body())
    assert response.status_code == 201, response.text
    bad = {
        "title": "X",
        "cards": [{"term": "a", "definition": "b", "wrong_definition_answers": ["b"]}],
    }
    headers["Idempotency-Key"] = str(uuid4())
    assert (await client.post("/api/v1/agent/sets", headers=headers, json=bad)).status_code == 422


async def test_agent_metadata_preserves_cards_progress_and_explicit_clear(
    client: AsyncClient,
) -> None:
    owner = await _auth(client, "agentmove")
    headers, _ = await token(client, owner)
    user_id = UUID((await client.get("/api/v1/auth/me", headers=owner)).json()["id"])
    saved = (
        await client.post(
            "/api/v1/agent/sets",
            headers=headers,
            json={
                "title": "До",
                "cards": [{"term": "Один", "definition": "1"}, {"term": "Два", "definition": "2"}],
            },
        )
    ).json()
    async with get_session_factory()() as db:
        state = CardState(
            user_id=user_id,
            set_id=UUID(saved["id"]),
            card_id=UUID(saved["cards"][0]["id"]),
            direction=StudyDirection.term_to_def,
            reps=7,
            scheduler_version=SCHEDULER_VERSION,
        )
        db.add(state)
        await db.commit()
        state_id = state.id
    folder = (
        await client.post(
            "/api/v1/agent/folders",
            headers={**headers, "Idempotency-Key": str(uuid4())},
            json={"title": "Папка"},
        )
    ).json()
    url = f"/api/v1/agent/sets/{saved['id']}"
    headers["Idempotency-Key"] = str(uuid4())
    body = {"title": "После", "folder_id": folder["id"], "revision": saved["revision"]}
    moved = await client.put(url, headers=headers, json=body)
    assert moved.status_code == 200
    current = (await client.get(url, headers=headers)).json()
    assert current["cards"] == saved["cards"] and current["folder_id"] == folder["id"]
    async with get_session_factory()() as db:
        state = await db.get(CardState, state_id)
        assert state is not None and state.reps == 7
    assert (await client.put(url, headers=headers, json=body)).json() == moved.json()
    assert (await client.put(url, headers=headers, json={**body, "cards": []})).status_code == 409
    cleared = await client.put(
        url,
        headers={**headers, "Idempotency-Key": str(uuid4())},
        json={**body, "revision": current["revision"], "cards": []},
    )
    assert cleared.status_code == 200 and cleared.json()["cards"] == []


async def test_agent_only_charges_new_writes_at_quota_boundary(client: AsyncClient) -> None:
    owner = await _auth(client, "agentlastwrite")
    headers, _ = await token(client, owner)
    user_id = UUID((await client.get("/api/v1/auth/me", headers=owner)).json()["id"])
    period, _ = week_period()
    async with get_session_factory()() as db:
        db.add(
            UsageCounter(
                user_id=user_id, metric="agent.writes_per_week", period_key=period, value=499
            )
        )
        await db.commit()
    url = "/api/v1/agent/sets"
    body = {"title": "Последняя запись"}
    first, retry = await asyncio.gather(
        *(client.post(url, headers=headers, json=body) for _ in range(2))
    )
    assert first.status_code == retry.status_code == 201 and first.json() == retry.json()
    assert (
        await client.post(url, headers=headers, json={"title": "Другая запись"})
    ).status_code == 409
    exhausted = await client.post(
        url, headers={**headers, "Idempotency-Key": str(uuid4())}, json=body
    )
    assert exhausted.status_code == 402
    assert exhausted.json()["details"]["limit_key"] == "agent.writes_per_week"
    usage = (await client.get("/api/v1/billing/entitlements", headers=owner)).json()["usage"]
    assert usage["agent.writes_per_week"] == 500


async def test_agent_course_metadata_preserves_nested_cards(client: AsyncClient) -> None:
    headers, _ = await token(client, await _auth(client, "agentnestedmove"))
    body = course_body()
    saved = (await client.post("/api/v1/agent/courses", headers=headers, json=body)).json()
    for section, original in zip(body["sections"], saved["sections"], strict=True):
        section["id"] = original["id"]
        article = section["articles"][0]
        article["id"] = original["articles"][0]["id"]
        article["material"].pop("cards")
    body["revision"] = saved["revision"]
    body["title"] = "Переименовано"
    res = await client.put(
        f"/api/v1/agent/courses/{saved['id']}",
        headers={**headers, "Idempotency-Key": str(uuid4())},
        json=body,
    )
    assert res.status_code == 200
    for section, original in zip(res.json()["sections"], saved["sections"], strict=True):
        assert (
            section["articles"][0]["material"]["cards"]
            == original["articles"][0]["material"]["cards"]
        )
