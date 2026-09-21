"""Редактор, изоляция и независимость составных учебных материалов."""

import asyncio
from copy import deepcopy
from unittest.mock import AsyncMock, patch
from uuid import uuid4

from httpx import AsyncClient
from sqlalchemy import update

from app.db.session import get_engine
from app.models.courses import Course
from tests.test_courses import auth
from tests.test_media import FakeStorage, _png


async def test_create_from_scratch_and_concurrent_structure_retry(client: AsyncClient) -> None:
    owner = await auth(client, "scratch")
    created = await client.post("/api/v1/courses", headers=owner, json={"title": "Новый курс"})
    assert created.status_code == 201
    course_id = created.json()["id"]
    course = (await client.get(f"/api/v1/courses/{course_id}/editor", headers=owner)).json()
    body = {
        "revision": course["revision"],
        "sections": [
            *course["sections"],
            {"title": "Второй раздел", "articles": [{"title": "Конспект"}]},
        ],
    }
    headers = {**owner, "Idempotency-Key": str(uuid4())}
    first, retry = await asyncio.gather(
        *[
            client.put(f"/api/v1/courses/{course_id}/structure", headers=headers, json=body)
            for _ in range(2)
        ]
    )
    assert first.status_code == retry.status_code == 200
    assert first.json() == retry.json()
    assert len((await client.get("/api/v1/sets", headers=owner)).json()) == 2


async def test_copy_clones_media_and_rolls_back_on_storage_failure(client: AsyncClient) -> None:
    owner, learner = await auth(client, "mediawriter"), await auth(client, "mediareader")
    course = await setup_course(client, owner)
    storage = FakeStorage(_png())
    with patch("app.services.media.get_object_storage", return_value=storage):
        asset = (
            await client.post(
                "/api/v1/media/upload-url",
                headers=owner,
                json={
                    "filename": "matrix.png",
                    "mime": "image/png",
                    "size_bytes": len(storage.payload),
                },
            )
        ).json()
        assert (
            await client.post(f"/api/v1/media/{asset['id']}/complete", headers=owner)
        ).status_code == 200
    set_id = course["sections"][0]["articles"][0]["set_id"]
    await client.put(
        f"/api/v1/sets/{set_id}/cards",
        headers=owner,
        json={
            "cards": [
                {
                    "term": "Матрица",
                    "definition": "Matrix",
                    "term_image_id": asset["id"],
                    "definition_image_id": asset["id"],
                }
            ]
        },
    )
    await client.post(f"/api/v1/courses/{course['id']}/publish", headers=owner, json={})
    storage.put = AsyncMock()  # type: ignore[attr-defined]
    with patch("app.services.course_editor.get_object_storage", return_value=storage):
        response = await client.post(
            f"/api/v1/courses/{course['id']}/copy",
            headers={**learner, "Idempotency-Key": str(uuid4())},
            json={},
        )
    assert response.status_code == 201, response.text
    new_set = response.json()["sections"][0]["articles"][0]["set_id"]
    copied = (await client.get(f"/api/v1/sets/{new_set}", headers=learner)).json()["cards"][0]
    assert copied["term_image_id"] == copied["definition_image_id"] != asset["id"]
    storage.put.assert_awaited_once()  # type: ignore[attr-defined]
    with patch("app.services.media.get_object_storage", return_value=storage):
        assert (
            await client.get(f"/api/v1/media/{copied['term_image_id']}", headers=learner)
        ).status_code == 200
        assert (
            await client.get(f"/api/v1/media/{copied['term_image_id']}", headers=owner)
        ).status_code == 403
    before = (await client.get("/api/v1/courses", headers=learner)).json()
    storage.put.side_effect = RuntimeError("storage unavailable")  # type: ignore[attr-defined]
    import pytest

    with (
        patch("app.services.course_editor.get_object_storage", return_value=storage),
        pytest.raises(RuntimeError, match="storage unavailable"),
    ):
        await client.post(
            f"/api/v1/courses/{course['id']}/copy",
            headers={**learner, "Idempotency-Key": str(uuid4())},
            json={},
        )
    assert (await client.get("/api/v1/courses", headers=learner)).json() == before
    assert len(storage.deleted) == 1


async def setup_course(client: AsyncClient, headers: dict[str, str]) -> dict:
    material = (
        await client.post("/api/v1/sets", headers=headers, json={"title": "Матрицы"})
    ).json()
    response = await client.put(
        f"/api/v1/sets/{material['id']}/cards",
        headers=headers,
        json={
            "cards": [
                {
                    "term": "Определитель",
                    "definition": "Число",
                    "wrong_term_answers": ["След"],
                    "wrong_definition_answers": ["Матрица"],
                }
            ]
        },
    )
    assert response.status_code == 200
    course = (
        await client.post(
            "/api/v1/courses", headers=headers, json={"title": "Алгебра", "set_id": material["id"]}
        )
    ).json()
    return (await client.get(f"/api/v1/courses/{course['id']}/editor", headers=headers)).json()


async def save(client: AsyncClient, owner: dict[str, str], course: dict, sections: list):
    return await client.put(
        f"/api/v1/courses/{course['id']}/structure",
        headers={**owner, "Idempotency-Key": str(uuid4())},
        json={"revision": course["revision"], "sections": sections},
    )


async def test_structure_reorder_move_remove_and_revision(client: AsyncClient) -> None:
    owner = await auth(client, "structure")
    course = await setup_course(client, owner)
    original = course["sections"][0]["articles"][0]
    sections = deepcopy(course["sections"])
    sections[0]["articles"][0]["body"] = "# Теория\n\n**Определитель** — число."
    sections.append(
        {"title": "Практика", "articles": [{"title": "Новая статья", "body": "Конспект"}]}
    )
    result = await save(client, owner, course, sections)
    assert result.status_code == 200, result.text
    changed = result.json()
    assert changed["sections"][0]["articles"][0]["id"] == original["id"]
    assert changed["sections"][1]["articles"][0]["set_id"] != original["set_id"]
    assert (await save(client, owner, course, sections)).status_code == 409
    reordered = deepcopy(changed["sections"])
    reordered.reverse()
    reordered[0]["articles"].append(reordered[1]["articles"].pop())
    result = await save(client, owner, changed, reordered)
    assert result.status_code == 200, result.text
    moved = result.json()
    assert moved["sections"][0]["articles"][1]["id"] == original["id"]
    assert moved["sections"][0]["articles"][1]["body"].startswith("# Теория")
    removed = await save(client, owner, moved, [])
    assert removed.status_code == 200
    assert (await client.get(f"/api/v1/sets/{original['set_id']}", headers=owner)).json()[
        "cards_count"
    ] == 1


async def test_structure_permissions_atomicity_and_publication(client: AsyncClient) -> None:
    owner, stranger = await auth(client, "editorowner"), await auth(client, "editorother")
    course = await setup_course(client, owner)
    other = await setup_course(client, stranger)
    assert (
        await client.get(f"/api/v1/courses/{course['id']}/editor", headers=stranger)
    ).status_code == 403
    assert (await save(client, stranger, course, [])).status_code == 403
    sections = deepcopy(course["sections"])
    sections.append(
        {
            "title": "Чужой",
            "articles": [
                {"title": "Чужое", "set_id": other["sections"][0]["articles"][0]["set_id"]}
            ],
        }
    )
    assert (await save(client, owner, course, sections)).status_code == 403
    sections = deepcopy(course["sections"])
    sections[0]["articles"].append(dict(sections[0]["articles"][0]))
    assert (await save(client, owner, course, sections)).status_code == 409
    current = (await client.get(f"/api/v1/courses/{course['id']}/editor", headers=owner)).json()
    assert current == course
    await client.post(f"/api/v1/courses/{course['id']}/publish", headers=owner, json={})
    current = (await client.get(f"/api/v1/courses/{course['id']}/editor", headers=owner)).json()
    assert (await save(client, owner, current, [])).status_code == 409


async def test_copy_public_course_and_article_independent_and_idempotent(
    client: AsyncClient,
) -> None:
    owner, learner = await auth(client, "copyowner"), await auth(client, "copylearner")
    course = await setup_course(client, owner)
    sections = deepcopy(course["sections"])
    sections[0]["articles"][0]["body"] = "Полный конспект"
    course = (await save(client, owner, course, sections)).json()
    path = f"/api/v1/courses/{course['id']}/copy"
    headers = {**learner, "Idempotency-Key": str(uuid4())}
    assert (await client.post(path, headers=headers, json={})).status_code == 404
    await client.post(f"/api/v1/courses/{course['id']}/publish", headers=owner, json={})
    result = await client.post(path, headers=headers, json={})
    assert result.status_code == 201, result.text
    copied = result.json()
    assert (await client.post(path, headers=headers, json={})).json() == copied
    assert copied["is_published"] is False
    article = copied["sections"][0]["articles"][0]
    assert article["body"] == "Полный конспект"
    assert article["id"] != course["sections"][0]["articles"][0]["id"]
    material = (await client.get(f"/api/v1/sets/{article['set_id']}", headers=learner)).json()
    assert material["cards"][0]["wrong_term_answers"] == ["След"]
    assert material["cards"][0]["wrong_definition_answers"] == ["Матрица"]
    assert (await save(client, owner, copied, copied["sections"])).status_code == 403
    single = await client.post(
        path,
        headers={**learner, "Idempotency-Key": str(uuid4())},
        json={"article_id": course["sections"][0]["articles"][0]["id"]},
    )
    assert single.status_code == 201
    assert len(single.json()["sections"]) == 1
    assert len(single.json()["sections"][0]["articles"]) == 1
    await client.post(f"/api/v1/courses/{course['id']}/unpublish", headers=owner)
    assert (
        await client.post(path, headers={**learner, "Idempotency-Key": str(uuid4())}, json={})
    ).status_code == 404
    assert (await client.get(f"/api/v1/courses/{copied['id']}", headers=learner)).status_code == 200
    assert (await save(client, learner, copied, copied["sections"])).status_code == 200


async def test_copy_set_from_public_course_is_independent_and_isolated(
    client: AsyncClient,
) -> None:
    """Набор копируется только из доступного курса; копия не зависит от оригинала."""
    owner, learner = await auth(client, "setcopyowner"), await auth(client, "setcopylearner")
    course = await setup_course(client, owner)
    set_id = course["sections"][0]["articles"][0]["set_id"]
    path = f"/api/v1/sets/{set_id}/copy"
    headers = {**learner, "Idempotency-Key": str(uuid4())}

    assert (await client.post(path)).status_code == 401
    # Курс ещё черновик: чужой набор недоступен даже по прямому идентификатору.
    assert (await client.post(path, headers=headers)).status_code == 404
    assert (await client.get(f"/api/v1/sets/{set_id}", headers=learner)).status_code == 403

    await client.post(f"/api/v1/courses/{course['id']}/publish", headers=owner, json={})
    created = await client.post(path, headers=headers)
    assert created.status_code == 201, created.text
    copied = created.json()
    assert copied["id"] != set_id
    assert copied["visibility"] == "private"
    assert copied["cards"][0]["term"] == "Определитель"
    assert copied["cards"][0]["wrong_term_answers"] == ["След"]
    assert copied["cards"][0]["wrong_definition_answers"] == ["Матрица"]
    assert copied["cards"][0]["id"] != set_id
    # Повтор с тем же ключом не создаёт второй набор.
    assert (await client.post(path, headers=headers)).json() == copied
    assert len((await client.get("/api/v1/sets", headers=learner)).json()) == 1

    # Копия принадлежит учащемуся и живёт отдельно от оригинала.
    edited = await client.put(
        f"/api/v1/sets/{copied['id']}/cards",
        headers=learner,
        json={"cards": [{"term": "Своё", "definition": "Значение"}]},
    )
    assert edited.status_code == 200
    original = (await client.get(f"/api/v1/sets/{set_id}", headers=owner)).json()
    assert original["cards"][0]["term"] == "Определитель"

    # После снятия с публикации копировать нельзя, но готовая копия остаётся.
    await client.post(f"/api/v1/courses/{course['id']}/unpublish", headers=owner)
    assert (
        await client.post(path, headers={**learner, "Idempotency-Key": str(uuid4())})
    ).status_code == 404
    assert (await client.get(f"/api/v1/sets/{copied['id']}", headers=learner)).status_code == 200


async def test_copy_set_is_blocked_for_moderated_and_missing_sources(client: AsyncClient) -> None:
    """Заблокированный модератором курс перестаёт быть источником копий."""
    owner, learner = await auth(client, "blockedowner"), await auth(client, "blockedlearner")
    course = await setup_course(client, owner)
    set_id = course["sections"][0]["articles"][0]["set_id"]
    path = f"/api/v1/sets/{set_id}/copy"
    await client.post(f"/api/v1/courses/{course['id']}/publish", headers=owner, json={})
    assert (
        await client.post(path, headers={**learner, "Idempotency-Key": str(uuid4())})
    ).status_code == 201

    async with get_engine().begin() as conn:
        await conn.execute(update(Course).values(moderation_status="blocked"))
    assert (
        await client.post(path, headers={**learner, "Idempotency-Key": str(uuid4())})
    ).status_code == 404

    missing = f"/api/v1/sets/{uuid4()}/copy"
    assert (
        await client.post(missing, headers={**learner, "Idempotency-Key": str(uuid4())})
    ).status_code == 404
