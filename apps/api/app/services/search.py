"""Индекс определяет релевантность, PostgreSQL — доступность результатов."""

import json
from typing import Any
from uuid import UUID

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import AppError
from app.core.search import SearchIndex
from app.repositories.search import course_documents
from app.schemas.search import CourseSearchItem, CourseSearchQuery, CourseSearchResult


class SearchUnavailableError(AppError):
    code = "SEARCH_UNAVAILABLE"
    status_code = 503
    message = "Поиск временно недоступен. Попробуйте позже"


def index_query(query: CourseSearchQuery) -> dict[str, Any]:
    filters = [f"cards_count >= {query.min_cards}"]
    # JSON-кавычки не дают пользовательскому тегу превратиться в выражение фильтра.
    for field, value in (
        ("tags", query.tag),
        ("languages", query.language),
        ("author_id", query.author_id),
    ):
        if value is not None:
            filters.append(f"{field} = {json.dumps(str(value))}")
    if query.max_cards is not None:
        filters.append(f"cards_count <= {query.max_cards}")
    if query.updated_after is not None:
        filters.append(f"updated_at >= {int(query.updated_after.timestamp())}")
    payload: dict[str, Any] = {
        "q": query.q,
        "filter": filters,
        "offset": query.cursor,
        "limit": query.limit,
    }
    if query.sort != "relevance":
        payload["sort"] = ["updated_at:desc" if query.sort == "updated" else "cards_count:desc"]
    return payload


def matches(document: dict[str, Any], query: CourseSearchQuery) -> bool:
    return (
        (query.tag is None or query.tag in document["tags"])
        and (query.language is None or query.language in document["languages"])
        and (query.author_id is None or str(query.author_id) == document["author_id"])
        and document["cards_count"] >= query.min_cards
        and (query.max_cards is None or document["cards_count"] <= query.max_cards)
        and (
            query.updated_after is None
            or document["updated_at"] >= int(query.updated_after.timestamp())
        )
    )


async def search_courses(db: AsyncSession, query: CourseSearchQuery) -> CourseSearchResult:
    settings = get_settings()
    try:
        async with SearchIndex.client_for(settings) as client:
            ids = await SearchIndex(client, settings.meili_index).search(index_query(query))
        documents = {
            item["id"]: item
            for item in await course_documents(
                db, [UUID(value) for value in ids], include_content=False
            )
        }
    except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
        raise SearchUnavailableError() from exc
    items = [
        CourseSearchItem.model_validate(documents[value])
        for value in dict.fromkeys(ids)
        if value in documents and matches(documents[value], query)
    ]
    next_cursor = query.cursor + len(ids)
    return CourseSearchResult(
        items=items,
        next_cursor=next_cursor if len(ids) == query.limit and next_cursor < 1000 else None,
    )
