import json

import httpx
import pytest

from app.core.search import SearchIndex, SearchTaskError


async def test_write_waits_for_success_and_sets_primary_key():
    requests = []
    statuses = iter(["processing", "succeeded"])

    def handle(request):
        requests.append(request)
        if request.method == "POST":
            return httpx.Response(202, json={"taskUid": 42})
        return httpx.Response(200, json={"status": next(statuses)})

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(handle), base_url="http://test"
    ) as client:
        await SearchIndex(client, "courses").replace([{"id": "course-1", "title": "Алгебра"}])
    assert len(requests) == 3
    assert requests[0].url.params["primaryKey"] == "id"
    assert requests[-1].url.path == "/tasks/42"


@pytest.mark.parametrize("status", ["failed", "canceled"])
async def test_failed_tasks_are_not_acknowledged(status):
    def handle(request):
        return httpx.Response(200, json={"taskUid": 1, "status": status, "error": "private data"})

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(handle), base_url="http://test"
    ) as client:
        with pytest.raises(SearchTaskError) as error:
            await SearchIndex(client, "courses").delete(["course-1"])
    assert "private data" not in str(error.value)


async def test_search_only_retrieves_ids():
    def handle(request):
        payload = json.loads(request.content)
        assert payload["attributesToRetrieve"] == ["id"]
        assert payload["q"] == "алгебра"
        return httpx.Response(200, json={"hits": [{"id": "one"}, {"id": "two"}]})

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(handle), base_url="http://test"
    ) as client:
        assert await SearchIndex(client, "courses").search({"q": "алгебра"}) == ["one", "two"]


async def test_http_failure_propagates():
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(lambda request: httpx.Response(503)), base_url="http://test"
    ) as client:
        with pytest.raises(httpx.HTTPStatusError):
            await SearchIndex(client, "courses").replace([{"id": "one"}])
