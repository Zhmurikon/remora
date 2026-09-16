"""Изоляция курсов и атомарное создание структуры."""

from uuid import UUID, uuid4

from httpx import AsyncClient
from sqlalchemy import update

from app.db.session import get_engine
from app.models.content import SetVisibility, StudySet


async def legacy_visibility(set_id: str, visibility: str) -> None:
    """Старые публикации создаём как данные предыдущей версии, не через новый API."""
    async with get_engine().begin() as conn:
        await conn.execute(
            update(StudySet)
            .where(StudySet.id == UUID(set_id))
            .values(visibility=SetVisibility(visibility))
        )


async def auth(client: AsyncClient, suffix: str) -> dict[str, str]:
    credentials = {"email": f"course-{suffix}@example.com", "password": "Str0ngP@ss!"}
    response = await client.post(
        "/api/v1/auth/register", json={**credentials, "username": f"course{suffix}"}
    )
    assert response.status_code == 201
    response = await client.post("/api/v1/auth/login", json=credentials)
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


async def test_course_structure_and_ownership(client: AsyncClient) -> None:
    owner = await auth(client, "owner")
    stranger = await auth(client, "stranger")
    study_set = await client.post("/api/v1/sets", headers=owner, json={"title": "Алгебра"})
    set_id = study_set.json()["id"]
    body = {"set_id": set_id, "title": "  Линейная алгебра  "}
    invalid = await client.post("/api/v1/courses", headers=owner, json={**body, "title": "   "})
    assert invalid.status_code == 422
    assert invalid.json()["code"] == "VALIDATION_ERROR"
    assert (await client.post("/api/v1/courses", headers=stranger, json=body)).status_code == 403
    created = await client.post("/api/v1/courses", headers=owner, json=body)
    assert created.status_code == 201
    course = created.json()
    assert course["title"] == "Линейная алгебра"
    assert len(course["sections"]) == 1
    assert course["sections"][0]["articles"][0]["set_id"] == set_id
    path = f"/api/v1/courses/{course['id']}"
    assert (await client.get(path, headers=owner)).status_code == 200
    assert (await client.get(path, headers=stranger)).status_code == 403
    assert (await client.get(path)).status_code == 401
    assert (await client.get("/api/v1/courses", headers=stranger)).json() == []
    assert (await client.put(path, headers=stranger, json={"title": "Чужое"})).status_code == 403
    updated = await client.put(path, headers=owner, json={"title": "Матрицы"})
    assert updated.json()["slug"] == course["slug"]
    assert updated.json()["title"] == "Матрицы"
    assert (await client.post("/api/v1/courses", headers=owner, json=body)).status_code == 409
    assert len((await client.get("/api/v1/courses", headers=owner)).json()) == 1


async def test_course_rejects_deleted_or_missing_sets(client: AsyncClient) -> None:
    owner = await auth(client, "deleted")
    study_set = await client.post("/api/v1/sets", headers=owner, json={"title": "Удаляемый"})
    set_id = study_set.json()["id"]
    await client.delete(f"/api/v1/sets/{set_id}", headers=owner)
    for unavailable_id in (set_id, str(uuid4())):
        response = await client.post(
            "/api/v1/courses",
            headers=owner,
            json={"set_id": unavailable_id, "title": "Курс"},
        )
        assert response.status_code == 404
    assert (await client.get("/api/v1/courses", headers=owner)).json() == []
