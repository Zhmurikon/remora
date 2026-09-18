from unittest.mock import AsyncMock

import httpx
import pytest

from app.core.search import SearchIndex
from app.schemas.search import CourseSearchQuery
from app.services.search import index_query


async def test_unavailable_search_uses_domain_error(client, monkeypatch):
    monkeypatch.setattr(SearchIndex, "search", AsyncMock(side_effect=httpx.ConnectError("secret")))
    response = await client.get("/api/v1/search/courses")
    assert response.status_code == 503
    assert response.json()["code"] == "SEARCH_UNAVAILABLE"
    assert "secret" not in response.text


@pytest.mark.parametrize(
    "params",
    [{"limit": 51}, {"cursor": -1}, {"min_cards": 5, "max_cards": 2}, {"updated_after": "bad"}],
)
async def test_invalid_filters(client, params):
    response = await client.get("/api/v1/search/courses", params=params)
    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_ERROR"


def test_filter_values_are_quoted():
    query = index_query(CourseSearchQuery(tag='x" OR author_id = "other', sort="updated"))
    assert query["filter"][1] == 'tags = "x\\" or author_id = \\"other"'
    assert query["sort"] == ["updated_at:desc"]


def test_popularity_is_sorted_by_saves():
    assert index_query(CourseSearchQuery(sort="popular"))["sort"] == ["saves_count:desc"]
