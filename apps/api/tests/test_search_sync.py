from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from sqlalchemy import delete, text

from app.db.session import get_session_factory
from app.models.courses import CourseSearchSync
from app.services import search_sync


async def test_reconcile_does_not_overlap_another_worker(client):
    index = AsyncMock()
    async with get_session_factory()() as db:
        await db.execute(text("SELECT pg_advisory_xact_lock(72636601)"))
        await search_sync.reconcile(index)
        index.configure.assert_not_awaited()


async def test_reconcile_replaces_visible_and_removes_hidden_and_deleted(client, monkeypatch):
    visible, hidden, deleted = uuid4(), uuid4(), uuid4()
    index = AsyncMock()
    index.document_ids.return_value = {str(visible), str(hidden), str(deleted)}
    documents = [{"id": str(visible), "title": "Алгебра"}]
    monkeypatch.setattr(search_sync, "course_ids", AsyncMock(side_effect=[[visible, hidden], []]))
    monkeypatch.setattr(search_sync, "course_documents", AsyncMock(return_value=documents))
    await search_sync.reconcile(index)
    index.configure.assert_awaited_once()
    index.replace.assert_awaited_once_with(documents)
    assert [call.args[0] for call in index.delete.await_args_list] == [
        [str(hidden)],
        [str(deleted)],
    ]


async def test_reconcile_retries_after_failure_without_losing_documents(client, monkeypatch):
    course_id = uuid4()
    documents = [{"id": str(course_id)}]
    index = AsyncMock()
    index.document_ids.return_value = set()
    index.replace.side_effect = [RuntimeError("unavailable"), None]
    monkeypatch.setattr(
        search_sync, "course_ids", AsyncMock(side_effect=[[course_id], [course_id], []])
    )
    monkeypatch.setattr(search_sync, "course_documents", AsyncMock(return_value=documents))
    with pytest.raises(RuntimeError, match="unavailable"):
        await search_sync.reconcile(index)
    await search_sync.reconcile(index)
    assert index.replace.await_count == 2


async def test_pending_sync_coalesces_course_changes_and_removes_completed_task(
    client, monkeypatch
):
    course_id = uuid4()
    async with get_session_factory()() as db:
        await db.execute(delete(CourseSearchSync))
        await search_sync.queue_course(db, course_id)
        await search_sync.queue_course(db, course_id)
        await db.commit()
        queued = await db.get(CourseSearchSync, course_id)
        assert queued is not None
        assert queued.version == 2

    index = AsyncMock()
    monkeypatch.setattr(
        search_sync,
        "course_documents",
        AsyncMock(return_value=[{"id": str(course_id), "title": "Алгебра"}]),
    )
    assert await search_sync.synchronize_pending(index) == 1
    index.replace.assert_awaited_once_with([{"id": str(course_id), "title": "Алгебра"}])

    async with get_session_factory()() as db:
        assert await db.get(CourseSearchSync, course_id) is None


async def test_pending_sync_keeps_task_after_index_failure(client, monkeypatch):
    course_id = uuid4()
    async with get_session_factory()() as db:
        await db.execute(delete(CourseSearchSync))
        await search_sync.queue_course(db, course_id)
        await db.commit()
    index = AsyncMock()
    index.replace.side_effect = RuntimeError("unavailable")
    monkeypatch.setattr(
        search_sync, "course_documents", AsyncMock(return_value=[{"id": str(course_id)}])
    )
    with pytest.raises(RuntimeError, match="unavailable"):
        await search_sync.synchronize_pending(index)
    async with get_session_factory()() as db:
        assert await db.get(CourseSearchSync, course_id) is not None
