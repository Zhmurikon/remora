from datetime import UTC, datetime
from unittest.mock import AsyncMock
from uuid import UUID

import pytest
from sqlalchemy import delete, update

from app.core.search import SearchIndex
from app.db.session import get_session_factory
from app.models.content import Card, StudySet
from app.models.courses import Course
from app.models.user import User, UserStatus
from app.repositories.search import course_documents
from tests.test_courses import auth


@pytest.mark.parametrize(
    "hidden",
    [
        None,
        "draft",
        "unlisted",
        "blocked",
        "suspended",
        "deleted_author",
        "deleted_set",
        "empty",
        "foreign_set",
    ],
)
async def test_index_only_contains_available_listed_courses(client, hidden, monkeypatch):
    headers = await auth(client, "search")
    response = await client.post("/api/v1/sets", headers=headers, json={"title": "Матрицы"})
    set_id = response.json()["id"]
    response = await client.put(
        f"/api/v1/sets/{set_id}/cards",
        headers=headers,
        json={"cards": [{"term": "Определитель", "definition": "Число", "position": 0}]},
    )
    assert response.status_code == 200
    response = await client.post(
        "/api/v1/courses", headers=headers, json={"title": "Алгебра", "set_id": set_id}
    )
    course_id = UUID(response.json()["id"])
    response = await client.post(
        f"/api/v1/courses/{course_id}/publish", headers=headers, json={"tags": ["математика"]}
    )
    assert response.status_code == 200
    foreign_id = None
    if hidden == "foreign_set":
        stranger = await auth(client, "searchother")
        foreign_id = UUID((await client.get("/api/v1/auth/me", headers=stranger)).json()["id"])
    async with get_session_factory()() as db:
        course = await db.get(Course, course_id)
        assert course is not None
        if hidden == "draft":
            course.is_published = False
        elif hidden == "unlisted":
            course.is_listed = False
        elif hidden == "blocked":
            course.moderation_status = "blocked"
        elif hidden == "suspended":
            await db.execute(
                update(User).where(User.id == course.owner_id).values(status=UserStatus.suspended)
            )
        elif hidden == "deleted_author":
            await db.execute(
                update(User).where(User.id == course.owner_id).values(deleted_at=datetime.now(UTC))
            )
        elif hidden == "deleted_set":
            await db.execute(
                update(StudySet)
                .where(StudySet.id == UUID(set_id))
                .values(deleted_at=datetime.now(UTC))
            )
        elif hidden == "empty":
            await db.execute(delete(Card).where(Card.set_id == UUID(set_id)))
        elif hidden == "foreign_set":
            await db.execute(
                update(StudySet).where(StudySet.id == UUID(set_id)).values(owner_id=foreign_id)
            )
        await db.flush()
        documents = await course_documents(db, [course_id])
        if hidden:
            assert documents == []
        else:
            assert len(documents) == 1
            document = documents[0]
            assert document["id"] == str(course_id)
            assert document["cards_count"] == 1
            assert document["languages"] == ["ru"]
            assert document["tags"] == ["математика"]
            assert "Определитель" in document["content"]
            assert "Число" in document["content"]
        await db.commit()
    monkeypatch.setattr(SearchIndex, "search", AsyncMock(return_value=[str(course_id)]))
    result = await client.get("/api/v1/search/courses")
    assert result.status_code == 200
    assert len(result.json()["items"]) == (0 if hidden else 1)
    if not hidden:
        assert "content" not in result.json()["items"][0]
