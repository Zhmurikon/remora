"""Перенос старых ссылок не публикует приватное и не индексирует доступ по ссылке."""

from importlib import import_module

from httpx import AsyncClient
from sqlalchemy import text

from app.db.session import get_engine
from tests.test_courses import allow_private, auth, legacy_visibility


async def test_set_visibility_is_independent_from_course_publication(client: AsyncClient) -> None:
    owner = await auth(client, "legacyguard")
    for mode in ("private", "unlisted"):
        denied = await client.post(
            "/api/v1/sets", headers=owner, json={"title": "Набор", "visibility": mode}
        )
        assert denied.status_code == 402
        assert denied.json()["details"]["limit_key"] == "materials.private"
    course = (await client.post("/api/v1/courses", headers=owner, json={"title": "Курс"})).json()
    assert course["is_published"] is True
    assert (
        await client.post(f"/api/v1/courses/{course['id']}/unpublish", headers=owner)
    ).status_code == 402
    assert (
        await client.post(
            "/api/v1/courses", headers=owner, json={"title": "Скрытый", "is_published": False}
        )
    ).status_code == 402
    await allow_private(client, owner)
    for visibility in ("public", "unlisted"):
        response = await client.post(
            "/api/v1/sets", headers=owner, json={"title": "Набор", "visibility": visibility}
        )
        assert response.status_code == 201
        assert response.json()["visibility"] == visibility
    study_set = (await client.post("/api/v1/sets", headers=owner, json={"title": "Набор"})).json()
    assert study_set["visibility"] == "public"
    path = f"/api/v1/sets/{study_set['id']}"
    assert (
        await client.patch(path, headers=owner, json={"title": "Набор", "visibility": "private"})
    ).status_code == 200
    assert (await client.get(f"/api/v1/sets/public/{study_set['slug']}")).status_code == 404
    assert (
        await client.patch(path, headers=owner, json={"title": "Набор", "visibility": "public"})
    ).status_code == 200
    assert (await client.get(f"/api/v1/sets/public/{study_set['slug']}")).status_code == 200
    updated = await client.patch(path, headers=owner, json={"title": "Новое название"})
    assert updated.status_code == 200
    assert updated.json()["visibility"] == "public"
    copy = await client.post(path + "/duplicate", headers=owner)
    assert copy.status_code == 201
    assert copy.json()["visibility"] == "public"
    assert (await client.get(f"/api/v1/sets/public/{copy.json()['slug']}")).status_code == 200


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


async def test_public_defaults_migrate_archived_content_and_typing_only(
    client: AsyncClient,
) -> None:
    from alembic.migration import MigrationContext
    from alembic.operations import Operations

    migration = import_module("migrations.versions.20261112_1200_public_materials")
    owner = await auth(client, "alldefaults")
    course = (await client.post("/api/v1/courses", headers=owner, json={"title": "Курс"})).json()
    material_id = course["sections"][0]["articles"][0]["set_id"]
    await client.get("/api/v1/study/settings", headers=owner)
    override = await client.put(
        f"/api/v1/study/sets/{material_id}/learn-settings",
        headers=owner,
        json={
            "question_types": ["typing", "choice"],
            "successes_required": 3,
            "typing_check": "self_check",
            "match_percent": 85,
        },
    )
    assert override.status_code == 200
    await client.delete(f"/api/v1/sets/{material_id}", headers=owner)

    def check(connection):
        with Operations.context(MigrationContext.configure(connection)):
            migration.downgrade()
            connection.execute(text("UPDATE study_sets SET visibility = 'private'"))
            connection.execute(text("UPDATE courses SET is_published = false, is_listed = false"))
            connection.execute(
                text("""UPDATE user_settings SET learn_question_types = '["typing"]'""")
            )
            migration.upgrade()
        assert (
            connection.scalar(
                text(
                    "SELECT count(*) FROM study_sets WHERE deleted_at IS NOT NULL "
                    "AND visibility = 'public'"
                )
            )
            == 1
        )
        assert (
            connection.scalar(
                text(
                    "SELECT count(*) FROM courses WHERE is_published AND is_listed "
                    "AND published_at IS NOT NULL"
                )
            )
            == 1
        )
        assert connection.scalar(text("SELECT learn_question_types FROM user_settings")) == [
            "choice",
            "recall",
        ]
        assert connection.execute(
            text("SELECT question_types, successes_required FROM user_set_learn_settings")
        ).one() == (["choice"], 3)

    async with get_engine().connect() as connection:
        await connection.run_sync(check)
        await connection.rollback()
