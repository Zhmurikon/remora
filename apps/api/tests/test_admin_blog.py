"""Редакционный блог в административной панели."""

from copy import deepcopy
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from httpx import AsyncClient
from sqlalchemy import func, select

from app.db.session import get_session_factory
from app.models.admin_security import AdminAuditLog
from app.models.blog import BlogPost
from app.models.user import UserRole
from tests.test_admin import promote, verified_admin_headers
from tests.test_admin_user_management import mutation_headers
from tests.test_agent_blog import post_body
from tests.test_courses import auth


async def test_admin_blog_draft_schedule_publication_and_audit(client: AsyncClient) -> None:
    suffix = uuid4().hex[:8]
    username = f"courseblog-owner-{suffix}"
    await auth(client, f"blog-owner-{suffix}")
    await promote(username, UserRole.admin)
    headers = await verified_admin_headers(username)
    headers["Idempotency-Key"] = f"blog-create-{uuid4()}"

    created = await client.post("/api/v1/admin/blog/posts", headers=headers, json=post_body())
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["state"] == "draft"
    assert body["author_username"] == username
    assert body["history"][0]["action"] == "admin.blog.created"

    denied = await client.get("/api/v1/admin/blog/posts")
    assert denied.status_code == 401
    listed = await client.get(
        "/api/v1/admin/blog/posts?query=интервальное&status=draft", headers=headers
    )
    assert listed.status_code == 200, listed.text
    assert listed.json()["total"] == 1

    changed_payload = deepcopy(post_body())
    changed_payload.update({"title": "Интервальное повторение без перегрузки", "revision": 1})
    update_headers = dict(headers)
    update_headers["Idempotency-Key"] = f"blog-update-{uuid4()}"
    changed = await client.put(
        f"/api/v1/admin/blog/posts/{body['id']}", headers=update_headers, json=changed_payload
    )
    assert changed.status_code == 200, changed.text
    assert changed.json()["revision"] == 2

    publish_at = datetime.now(UTC) + timedelta(hours=2)
    scheduled = await client.post(
        f"/api/v1/admin/blog/posts/{body['id']}/publication",
        headers=await mutation_headers(username, f"blog-schedule-{uuid4()}"),
        json={
            "action": "schedule",
            "revision": 2,
            "reason": "Публикация по редакционному календарю",
            "publish_at": publish_at.isoformat(),
        },
    )
    assert scheduled.status_code == 200, scheduled.text
    assert scheduled.json()["state"] == "scheduled"
    assert (await client.get(f"/api/v1/blog/posts/{body['slug']}")).status_code == 404

    async with get_session_factory()() as db:
        post = await db.scalar(select(BlogPost).where(BlogPost.id == body["id"]))
        assert post is not None
        post.published_at = datetime.now(UTC) - timedelta(minutes=1)
        await db.commit()

    public = await client.get(f"/api/v1/blog/posts/{body['slug']}")
    assert public.status_code == 200, public.text
    assert public.json()["title"] == changed_payload["title"]
    published_list = await client.get("/api/v1/admin/blog/posts?status=published", headers=headers)
    assert published_list.status_code == 200
    assert [item["id"] for item in published_list.json()["items"]] == [body["id"]]
    scheduled_list = await client.get("/api/v1/admin/blog/posts?status=scheduled", headers=headers)
    assert scheduled_list.status_code == 200
    assert scheduled_list.json()["items"] == []

    unpublished = await client.post(
        f"/api/v1/admin/blog/posts/{body['id']}/publication",
        headers=await mutation_headers(username, f"blog-unpublish-{uuid4()}"),
        json={
            "action": "unpublish",
            "revision": 3,
            "reason": "Статья возвращена на редакционную доработку",
        },
    )
    assert unpublished.status_code == 200, unpublished.text
    assert unpublished.json()["state"] == "draft"
    assert (await client.get(f"/api/v1/blog/posts/{body['slug']}")).status_code == 404

    async with get_session_factory()() as db:
        actions = await db.scalar(
            select(func.count(AdminAuditLog.id)).where(
                AdminAuditLog.target_id == body["id"],
                AdminAuditLog.action.like("admin.blog.%"),
            )
        )
        assert actions == 4


async def test_admin_blog_rejects_stale_revision_and_unconfirmed_publication(
    client: AsyncClient,
) -> None:
    suffix = uuid4().hex[:8]
    username = f"courseblog-security-{suffix}"
    await auth(client, f"blog-security-{suffix}")
    regular = await auth(client, f"blog-regular-{suffix}")
    await promote(username, UserRole.admin)
    admin = await verified_admin_headers(username)
    admin["Idempotency-Key"] = f"blog-create-{uuid4()}"
    created = await client.post("/api/v1/admin/blog/posts", headers=admin, json=post_body())
    assert created.status_code == 201, created.text

    forbidden = await client.get("/api/v1/admin/blog/posts", headers=regular)
    assert forbidden.status_code == 403
    unconfirmed = await client.post(
        f"/api/v1/admin/blog/posts/{created.json()['id']}/publication",
        headers={**admin, "Idempotency-Key": f"blog-publish-{uuid4()}"},
        json={
            "action": "publish",
            "revision": 1,
            "reason": "Материал прошёл редакционную проверку",
        },
    )
    assert unconfirmed.status_code == 403

    stale = {**post_body(), "revision": 999}
    response = await client.put(
        f"/api/v1/admin/blog/posts/{created.json()['id']}",
        headers={**admin, "Idempotency-Key": f"blog-stale-{uuid4()}"},
        json=stale,
    )
    assert response.status_code == 409
    assert response.json()["details"]["reason"] == "stale_revision"
