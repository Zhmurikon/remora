"""Постмодерация: жалоба не скрывает материал, видимость меняет только решение модератора."""

from httpx import AsyncClient
from sqlalchemy import update

from app.db.session import get_engine
from app.models.user import User, UserRole
from tests.test_courses import auth


async def promote(client: AsyncClient, suffix: str, role: UserRole) -> dict[str, str]:
    """Роль выдаётся напрямую в БД: ручной выдачи прав в API пока нет, это задача E10."""
    headers = await auth(client, suffix)
    async with get_engine().begin() as conn:
        await conn.execute(
            update(User).where(User.username == f"course{suffix}").values(role=role)
        )
    return headers


async def publish_course(client: AsyncClient, owner: dict[str, str], title: str) -> dict[str, str]:
    study_set = (await client.post("/api/v1/sets", headers=owner, json={"title": title})).json()
    await client.put(
        f"/api/v1/sets/{study_set['id']}/cards",
        headers=owner,
        json={"cards": [{"term": "A", "definition": "B"}]},
    )
    course = (
        await client.post(
            "/api/v1/courses", headers=owner, json={"title": title, "set_id": study_set["id"]}
        )
    ).json()
    published = await client.post(
        f"/api/v1/courses/{course['id']}/publish", headers=owner, json={}
    )
    assert published.status_code == 200, published.text
    return {"id": course["id"], "slug": course["slug"], "set_slug": study_set["slug"]}


async def test_report_is_accepted_without_hiding_the_course(client: AsyncClient) -> None:
    owner = await auth(client, "report-owner")
    reader = await auth(client, "report-reader")
    other = await auth(client, "report-other")
    course = await publish_course(client, owner, "Открытый курс")
    public = f"/api/v1/courses/public/{course['slug']}"
    report_path = public + "/report"
    body = {"reason": "spam", "comment": "Реклама в теории"}

    assert (await client.post(report_path, json=body)).status_code == 401
    forbidden = await client.post(report_path, headers=owner, json=body)
    assert forbidden.status_code == 403
    assert forbidden.json()["code"] == "FORBIDDEN"
    invalid = await client.post(report_path, headers=reader, json={"reason": "нипонравилось"})
    assert invalid.status_code == 422
    assert invalid.json()["code"] == "VALIDATION_ERROR"

    created = await client.post(report_path, headers=reader, json=body)
    assert created.status_code == 201, created.text
    assert created.json()["status"] == "open"
    assert created.json()["reason"] == "spam"

    # Главное правило постмодерации: до решения модератора курс полностью доступен.
    visible = await client.get(public)
    assert visible.status_code == 200
    assert visible.json()["moderation_status"] == "pending"
    assert (await client.get(f"/api/v1/sets/public/{course['set_slug']}")).status_code == 200

    duplicate = await client.post(report_path, headers=reader, json=body)
    assert duplicate.status_code == 409
    assert duplicate.json()["code"] == "CONFLICT"
    assert (await client.post(report_path, headers=other, json=body)).status_code == 201

    await client.post(f"/api/v1/courses/{course['id']}/unpublish", headers=owner)
    assert (await client.post(report_path, headers=other, json=body)).status_code == 404
    assert (await client.post(public + "-нет/report", headers=other, json=body)).status_code == 404


async def test_moderation_queue_is_closed_to_regular_users(client: AsyncClient) -> None:
    owner = await auth(client, "queue-owner")
    reader = await auth(client, "queue-reader")
    moderator = await promote(client, "queue-moderator", UserRole.moderator)
    course = await publish_course(client, owner, "Курс для очереди")
    report = (
        await client.post(
            f"/api/v1/courses/public/{course['slug']}/report",
            headers=reader,
            json={"reason": "misleading", "comment": "Ошибки в определениях"},
        )
    ).json()
    resolve = f"/api/v1/moderation/reports/{report['id']}/resolve"

    assert (await client.get("/api/v1/moderation/reports")).status_code == 401
    assert (await client.post(resolve, json={"outcome": "accepted"})).status_code == 401
    for headers in (reader, owner):
        assert (await client.get("/api/v1/moderation/reports", headers=headers)).status_code == 403
        denied = await client.post(resolve, headers=headers, json={"outcome": "accepted"})
        assert denied.status_code == 403
        assert denied.json()["code"] == "FORBIDDEN"

    queue = await client.get("/api/v1/moderation/reports", headers=moderator)
    assert queue.status_code == 200
    assert [item["id"] for item in queue.json()] == [report["id"]]
    assert queue.json()[0]["course_slug"] == course["slug"]
    assert queue.json()[0]["reporter_username"] == "coursequeue-reader"
    assert queue.json()[0]["comment"] == "Ошибки в определениях"
    # Курс остаётся опубликованным, пока жалоба лежит в очереди.
    assert queue.json()[0]["course_is_published"] is True
    assert queue.json()[0]["course_moderation_status"] == "pending"
    resolved = await client.get("/api/v1/moderation/reports?status=accepted", headers=moderator)
    assert resolved.json() == []


async def test_accepted_report_blocks_course_and_rejected_keeps_it(client: AsyncClient) -> None:
    owner = await auth(client, "decide-owner")
    reader = await auth(client, "decide-reader")
    moderator = await promote(client, "decide-moderator", UserRole.admin)
    blocked = await publish_course(client, owner, "Нарушающий курс")
    kept = await publish_course(client, owner, "Честный курс")

    async def report(course: dict[str, str], reason: str) -> str:
        response = await client.post(
            f"/api/v1/courses/public/{course['slug']}/report",
            headers=reader,
            json={"reason": reason, "comment": ""},
        )
        assert response.status_code == 201, response.text
        return str(response.json()["id"])

    blocked_report = await report(blocked, "copyright")
    kept_report = await report(kept, "offensive")

    bad_outcome = await client.post(
        f"/api/v1/moderation/reports/{kept_report}/resolve",
        headers=moderator,
        json={"outcome": "open"},
    )
    assert bad_outcome.status_code == 422

    rejected = await client.post(
        f"/api/v1/moderation/reports/{kept_report}/resolve",
        headers=moderator,
        json={"outcome": "rejected"},
    )
    assert rejected.status_code == 200, rejected.text
    assert rejected.json()["status"] == "rejected"
    assert rejected.json()["course_moderation_status"] == "ok"
    assert (await client.get(f"/api/v1/courses/public/{kept['slug']}")).status_code == 200

    accepted = await client.post(
        f"/api/v1/moderation/reports/{blocked_report}/resolve",
        headers=moderator,
        json={"outcome": "accepted"},
    )
    assert accepted.status_code == 200
    assert accepted.json()["course_moderation_status"] == "blocked"
    assert (await client.get(f"/api/v1/courses/public/{blocked['slug']}")).status_code == 404
    assert (await client.get(f"/api/v1/sets/public/{blocked['set_slug']}")).status_code == 404
    # Блокировка убирает курс из выдачи, но данные автора остаются на месте.
    owned = await client.get(f"/api/v1/courses/{blocked['id']}", headers=owner)
    assert owned.status_code == 200
    assert owned.json()["moderation_status"] == "blocked"
    assert (
        await client.post(f"/api/v1/courses/{blocked['id']}/publish", headers=owner, json={})
    ).status_code == 403

    repeated = await client.post(
        f"/api/v1/moderation/reports/{blocked_report}/resolve",
        headers=moderator,
        json={"outcome": "rejected"},
    )
    assert repeated.status_code == 409
    assert (
        await client.post(
            "/api/v1/moderation/reports/00000000-0000-0000-0000-000000000000/resolve",
            headers=moderator,
            json={"outcome": "accepted"},
        )
    ).status_code == 404


async def test_rejected_report_does_not_unblock_course(client: AsyncClient) -> None:
    """Отклонение одной жалобы не снимает блокировку, поставленную по другой."""
    owner = await auth(client, "unblock-owner")
    first = await auth(client, "unblock-first")
    second = await auth(client, "unblock-second")
    moderator = await promote(client, "unblock-moderator", UserRole.moderator)
    course = await publish_course(client, owner, "Дважды обжалованный курс")
    path = f"/api/v1/courses/public/{course['slug']}/report"
    body = {"reason": "adult", "comment": ""}
    blocking = (await client.post(path, headers=first, json=body)).json()["id"]
    second_report = (await client.post(path, headers=second, json=body)).json()["id"]

    await client.post(
        f"/api/v1/moderation/reports/{blocking}/resolve",
        headers=moderator,
        json={"outcome": "accepted"},
    )
    rejected = await client.post(
        f"/api/v1/moderation/reports/{second_report}/resolve",
        headers=moderator,
        json={"outcome": "rejected"},
    )
    assert rejected.status_code == 200
    assert rejected.json()["status"] == "rejected"
    assert rejected.json()["course_moderation_status"] == "blocked"
    assert (await client.get(f"/api/v1/courses/public/{course['slug']}")).status_code == 404
