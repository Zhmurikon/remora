"""Опциональный сквозной тест: PostgreSQL, Redis, настоящий ARQ worker и Meilisearch."""

import os
from uuid import uuid4

import pytest
from arq.connections import RedisSettings, create_pool
from arq.worker import Worker

from app.core.config import get_settings
from app.core.search import SearchIndex
from app.worker import sync_course_search
from tests.test_courses import auth


@pytest.mark.skipif(
    os.getenv("RUN_SEARCH_INTEGRATION") != "1", reason="Нужен локальный Meilisearch"
)
async def test_worker_publication_update_and_unpublish(client, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "meili_index", f"test_courses_{uuid4().hex}")
    monkeypatch.setenv("NO_PROXY", "localhost,127.0.0.1")
    monkeypatch.setenv("no_proxy", "localhost,127.0.0.1")
    headers = await auth(client, "live")
    response = await client.post(
        "/api/v1/sets", headers=headers, json={"title": "Линейная алгебра"}
    )
    set_id = response.json()["id"]
    response = await client.put(
        f"/api/v1/sets/{set_id}/cards",
        headers=headers,
        json={"cards": [{"term": "Матрица", "definition": "Таблица чисел", "position": 0}]},
    )
    assert response.status_code == 200
    response = await client.post(
        "/api/v1/courses", headers=headers, json={"title": "Алгебра", "set_id": set_id}
    )
    course_id = response.json()["id"]
    path = f"/api/v1/courses/{course_id}"
    assert (
        await client.post(f"{path}/publish", headers=headers, json={"tags": ["математика"]})
    ).status_code == 200
    queue = f"test-search-{uuid4().hex}"
    pool = await create_pool(RedisSettings.from_dsn(str(settings.redis_url)))
    worker = Worker(
        [sync_course_search], redis_pool=pool, queue_name=queue, burst=True, handle_signals=False
    )
    async with SearchIndex.client_for(settings) as transport:
        index = SearchIndex(transport, settings.meili_index)
        try:

            async def run_sync():
                job = await pool.enqueue_job("sync_course_search", _queue_name=queue)
                assert job is not None
                await worker.async_run()
                assert await job.result(timeout=5) is None

            await run_sync()
            result = await client.get(
                "/api/v1/search/courses", params={"q": "Матрица", "tag": "математика"}
            )
            assert result.status_code == 200
            assert [item["id"] for item in result.json()["items"]] == [course_id]
            assert (
                await client.put(path, headers=headers, json={"title": "Геометрия"})
            ).status_code == 200
            await run_sync()
            assert await index.search({"q": "Геометрия"}) == [course_id]
            response = await client.put(
                f"/api/v1/sets/{set_id}/cards",
                headers=headers,
                json={"cards": [{"term": "Треугольник", "definition": "Фигура", "position": 0}]},
            )
            assert response.status_code == 200
            await run_sync()
            assert await index.search({"q": "Треугольник"}) == [course_id]
            assert await index.search({"q": "Матрица"}) == []
            assert (await client.post(f"{path}/unpublish", headers=headers)).status_code == 200
            # Даже до следующего запуска worker индекс не даёт доступ к скрытому курсу.
            assert (await client.get("/api/v1/search/courses")).json()["items"] == []
            await run_sync()
            assert await index.document_ids() == set()
        finally:
            await index._write("DELETE", index.path)
            await worker.close()
