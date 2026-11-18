from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

from sqlalchemy import select

from app.assistant_worker import advance_assistant_tasks
from app.db.session import get_session_factory
from app.generation_worker import process_generation
from app.models.billing import Entitlement, EntitlementSource
from app.models.transcriptions import TranscriptionJob, TranscriptionStatus
from app.models.user import User
from tests.test_generations import mock_provider, setup, start
from tests.test_transcriptions import register


async def grant(source, **features):
    async with get_session_factory()() as db:
        row = await db.get(TranscriptionJob, UUID(source))
        for key, value in features.items():
            existing = await db.scalar(
                select(Entitlement).where(
                    Entitlement.user_id == row.user_id, Entitlement.key == key
                )
            )
            if existing:
                existing.value = value
            else:
                db.add(
                    Entitlement(
                        user_id=row.user_id,
                        key=key,
                        value=value,
                        source=EntitlementSource.admin,
                        reason="Тест",
                        starts_at=datetime.now(UTC) - timedelta(minutes=1),
                    )
                )
        await db.commit()


async def source_copy(source):
    async with get_session_factory()() as db:
        old = await db.get(TranscriptionJob, UUID(source))
        row = TranscriptionJob(
            user_id=old.user_id,
            filename="Слайды.pptx",
            content_type="application/octet-stream",
            size_bytes=30,
            total_parts=1,
            status=TranscriptionStatus.completed,
            result_text="Среднее: сумма значений, делённая на их число.",
        )
        db.add(row)
        await db.commit()
        return str(row.id)


async def task(client, headers, sources, **kwargs):
    return await client.post(
        "/api/v1/assistant/tasks",
        headers=headers,
        json={"request_id": str(uuid4()), "source_ids": sources, **kwargs},
    )


async def test_task_sources_limit_ownership_and_durable_pipeline(client, monkeypatch):
    headers, source = await setup(client, monkeypatch)
    await grant(source, **{"limit.ai.sources_per_task": 2, "feature.materials.private": True})
    second, third = await source_copy(source), await source_copy(source)
    other, other_email = await register(client, "outsider")
    foreign = await source_copy(source)
    async with get_session_factory()() as db:
        foreign_row = await db.get(TranscriptionJob, UUID(foreign))
        foreign_row.user_id = await db.scalar(select(User.id).where(User.email == other_email))
        await db.commit()
    assert (await task(client, headers, [source, foreign])).status_code == 404
    assert (await task(client, headers, [source, second, third])).status_code == 402
    assert (await task(client, headers, [source, source])).status_code == 422
    await grant(source, **{"limit.ai.sources_per_task": 5})
    assert (await task(client, other, [source])).status_code in (402, 404)
    response = await task(client, headers, [source, second], result="both")
    assert response.status_code == 201, response.text
    item = response.json()
    assert (await client.get("/api/v1/assistant/tasks", headers=other)).json() == []
    assert (
        await client.post(f"/api/v1/assistant/tasks/{item['id']}/retry", headers=other)
    ).status_code == 404
    assert (await task(client, headers, [second])).status_code == 409
    assert (
        await client.delete(f"/api/v1/transcriptions/{source}", headers=headers)
    ).status_code == 409
    assert (
        await client.delete(f"/api/v1/transcriptions/{second}", headers=headers)
    ).status_code == 409
    mock_provider(monkeypatch)
    await advance_assistant_tasks({})
    await advance_assistant_tasks({})
    jobs = (
        await client.get(f"/api/v1/transcriptions/{source}/generations", headers=headers)
    ).json()
    assert len(jobs) == 1
    await process_generation({}, jobs[0]["id"])
    await advance_assistant_tasks({})
    item = (await client.get("/api/v1/assistant/tasks", headers=headers)).json()[0]
    assert item["status"] == "cards"
    mock_provider(monkeypatch, cards=True)
    await process_generation({}, item["cards_id"])
    await advance_assistant_tasks({})
    assert (await client.get("/api/v1/assistant/tasks", headers=headers)).json()[0][
        "status"
    ] == "completed"
    monkeypatch.setattr("app.services.transcriptions.get_object_storage", lambda: AsyncMock())
    assert (
        await client.delete(f"/api/v1/transcriptions/{source}", headers=headers)
    ).status_code == 204
    assert (await client.get("/api/v1/assistant/tasks", headers=headers)).json() == []
    assert (
        await client.get(f"/api/v1/transcriptions/{second}", headers=headers)
    ).status_code == 404


async def test_refine_access_preview_apply_stale_revision_and_history(client, monkeypatch):
    headers, source = await setup(client, monkeypatch)
    await grant(source, **{"feature.materials.private": True})
    note = await start(client, headers, source)
    mock_provider(monkeypatch)
    await process_generation({}, note["id"])
    path = f"/api/v1/generations/{note['id']}"
    ready = (await client.get(path, headers=headers)).json()
    body = {
        "request_id": str(uuid4()),
        "revision": ready["updated_at"],
        "instruction": "Сделай короче",
        "scope": "all",
    }
    assert (await client.post(path + "/refine", headers=headers, json=body)).status_code == 402
    await grant(source, **{"feature.ai.refinement": True})
    response = await client.post(path + "/refine", headers=headers, json=body)
    assert response.status_code == 202, response.text
    proposal = response.json()
    assert proposal["is_proposal"]
    assert (await client.post(path + "/refine", headers=headers, json=body)).json()[
        "id"
    ] == proposal["id"]
    await process_generation({}, proposal["id"])
    assert (await client.get(path, headers=headers)).json()["updated_at"] == ready["updated_at"]
    assert (await client.get(f"/api/v1/notes/public/{proposal['id']}")).status_code == 404
    other, _ = await register(client, "reader")
    for suffix in ["/revisions", ""]:
        assert (await client.get(path + suffix, headers=other)).status_code == 404
    apply = {"revision": ready["updated_at"], "proposal_id": proposal["id"]}
    assert (await client.post(path + "/apply", headers=other, json=apply)).status_code == 404
    applied = await client.post(path + "/apply", headers=headers, json=apply)
    assert applied.status_code == 200, applied.text
    assert (await client.post(path + "/apply", headers=headers, json=apply)).status_code == 200
    history = (await client.get(path + "/revisions", headers=headers)).json()
    assert len(history) == 1 and history[0]["markdown"] == ready["markdown"]
    body.update(
        request_id=str(uuid4()),
        revision=applied.json()["updated_at"],
        scope="fragment",
        fragment="Мера разброса.",
    )
    proposed = await client.post(path + "/refine", headers=headers, json=body)
    assert proposed.status_code == 202, proposed.text
    await process_generation({}, proposed.json()["id"])
    edited = await client.patch(
        path, headers=headers, json={"revision": body["revision"], "markdown": "# Новая редакция"}
    )
    stale = await client.post(
        path + "/apply",
        headers=headers,
        json={"revision": edited.json()["updated_at"], "proposal_id": proposed.json()["id"]},
    )
    assert stale.status_code == 409


async def test_note_course_has_one_body_and_private_course_hides_public_note(client, monkeypatch):
    headers, source = await setup(client, monkeypatch)
    await grant(source, **{"feature.materials.private": True})
    note = await start(client, headers, source)
    mock_provider(monkeypatch)
    await process_generation({}, note["id"])
    path = f"/api/v1/generations/{note['id']}"
    ready = (await client.get(path, headers=headers)).json()
    body = {"revision": ready["updated_at"], "title": "Общий конспект"}
    response = await client.post(path + "/course", headers=headers, json=body)
    assert response.status_code == 200, response.text
    linked = response.json()
    assert linked["article_id"] and linked["course_id"]
    assert (await client.post(path + "/course", headers=headers, json=body)).json()[
        "article_id"
    ] == linked["article_id"]
    edit = await client.patch(
        path, headers=headers, json={"revision": linked["updated_at"], "markdown": "# Из помощника"}
    )
    assert edit.status_code == 200, edit.text
    from app.schemas.courses import ArticleWrite, CourseStructureWrite, SectionWrite
    from app.services.course_editor import CourseEditorService

    async with get_session_factory()() as db:
        user = await db.scalar(
            select(User).where(User.id == (await db.get(TranscriptionJob, UUID(source))).user_id)
        )
        editor = CourseEditorService(db)
        detail = await editor.detail(user, UUID(linked["course_id"]))
        assert detail.sections[0].articles[0].body == "# Из помощника"
        structure = [
            SectionWrite(
                id=s.id,
                title=s.title,
                articles=[
                    ArticleWrite(
                        id=a.id, set_id=a.set_id, title=a.title, body="# Из редактора курса"
                    )
                    for a in s.articles
                ],
            )
            for s in detail.sections
        ]
        await editor.save(
            user,
            UUID(linked["course_id"]),
            CourseStructureWrite(revision=detail.revision, sections=structure),
        )
        await db.commit()
    assert (await client.get(path, headers=headers)).json()["markdown"] == "# Из редактора курса"
    from app.models.courses import Course

    async with get_session_factory()() as db:
        course = await db.get(Course, UUID(linked["course_id"]))
        course.is_published = False
        await db.commit()
    assert (await client.get(f"/api/v1/notes/public/{note['id']}")).status_code == 404
    assert (await client.get(path, headers=headers)).status_code == 200
