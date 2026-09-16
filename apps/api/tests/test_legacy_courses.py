"""Перенос старых ссылок не публикует приватное и не индексирует доступ по ссылке."""

from importlib import import_module

from httpx import AsyncClient
from sqlalchemy import text

from app.db.session import get_engine
from tests.test_courses import auth, legacy_visibility


async def test_set_publication_is_only_managed_by_course(client: AsyncClient) -> None:
    owner = await auth(client, "legacyguard")
    for visibility in ("public", "unlisted"):
        response = await client.post(
            "/api/v1/sets", headers=owner, json={"title": "Набор", "visibility": visibility}
        )
        assert response.status_code == 409
        assert response.json()["details"]["action"] == "publish_course"
    study_set = (await client.post("/api/v1/sets", headers=owner, json={"title": "Набор"})).json()
    path = f"/api/v1/sets/{study_set['id']}"
    assert (
        await client.patch(path, headers=owner, json={"title": "Набор", "visibility": "public"})
    ).status_code == 409
    await legacy_visibility(study_set["id"], "public")
    # Сам флаг старого набора больше не открывает доступ без курса.
    assert (await client.get(f"/api/v1/sets/public/{study_set['slug']}")).status_code == 404
    updated = await client.patch(path, headers=owner, json={"title": "Новое название"})
    assert updated.status_code == 200
    assert updated.json()["visibility"] == "public"
    copy = await client.post(path + "/duplicate", headers=owner)
    assert copy.status_code == 201
    assert copy.json()["visibility"] == "private"
    assert (await client.get(f"/api/v1/sets/public/{copy.json()['slug']}")).status_code == 404


async def test_legacy_backfill_is_idempotent_and_preserves_visibility(client: AsyncClient) -> None:
    owner = await auth(client, "legacy")
    sets = {}
    for visibility in ("public", "unlisted", "private"):
        response = await client.post("/api/v1/sets", headers=owner, json={"title": visibility})
        sets[visibility] = response.json()
        await legacy_visibility(response.json()["id"], visibility)
    deleted = (await client.post("/api/v1/sets", headers=owner, json={"title": "Удалённый"})).json()
    await legacy_visibility(deleted["id"], "public")
    await client.delete(f"/api/v1/sets/{deleted['id']}", headers=owner)
    migration = import_module(
        "migrations.versions.20260916_0502_migrate_legacy_public_sets_to_courses"
    )
    async with get_engine().begin() as conn:
        await conn.run_sync(migration.backfill_legacy_courses)
        await conn.run_sync(migration.backfill_legacy_courses)
        assert (await conn.scalar(text("SELECT count(*) FROM courses"))) == 2
    courses = (await client.get("/api/v1/courses", headers=owner)).json()
    assert len(courses) == 2
    for course in courses:
        assert course["is_published"] is True
        assert course["is_listed"] is (course["title"] == "public")
        public = await client.get(f"/api/v1/courses/public/{course['slug']}")
        assert public.status_code == 200
        study_set = sets[course["title"]]
        assert public.json()["sections"][0]["articles"][0]["set_id"] == study_set["id"]
        legacy = await client.get(f"/api/v1/sets/public/{study_set['slug']}")
        assert legacy.status_code == 200
        assert legacy.json()["course_url"].startswith(f"/kurs/{course['slug']}#article-")
    assert (await client.get(f"/api/v1/sets/public/{sets['private']['slug']}")).status_code == 404
