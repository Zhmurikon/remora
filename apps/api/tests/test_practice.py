"""Синхронизация прогресса практики изолирована по пользователям и версиям."""

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest

from tests.test_study import _auth


def _progress(
    *,
    version: int = 1,
    status: str = "in_progress",
    attempts: int = 1,
    draft: str = "print(1)",
    updated_at: datetime | None = None,
    mutation_id: str | None = None,
) -> dict[str, object]:
    return {
        "task_version": version,
        "status": status,
        "attempts": attempts,
        "draft": draft,
        "client_updated_at": (updated_at or datetime.now(UTC)).isoformat(),
        "client_mutation_id": mutation_id or str(uuid4()),
    }


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_progress_is_private_and_requires_auth(
    _mock_send: AsyncMock, client: pytest.fixture
) -> None:
    owner = await _auth(client, "practice-owner")
    other = await _auth(client, "practice-other")

    created = await client.put(
        "/api/v1/practice/python/progress/python-factorial",
        headers=owner,
        json=_progress(draft="def factorial(n): return 1"),
    )
    assert created.status_code == 200
    assert len((await client.get("/api/v1/practice/python/progress", headers=owner)).json()) == 1
    assert (await client.get("/api/v1/practice/python/progress", headers=other)).json() == []
    assert (await client.get("/api/v1/practice/python/progress")).status_code == 401


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_progress_merge_is_idempotent_and_never_downgrades(
    _mock_send: AsyncMock, client: pytest.fixture
) -> None:
    headers = await _auth(client, "practice-merge")
    now = datetime.now(UTC)
    mutation_id = str(uuid4())
    solved = _progress(
        status="solved",
        attempts=4,
        draft="new draft",
        updated_at=now,
        mutation_id=mutation_id,
    )
    first = await client.put(
        "/api/v1/practice/python/progress/python-factorial", headers=headers, json=solved
    )
    repeated = await client.put(
        "/api/v1/practice/python/progress/python-factorial", headers=headers, json=solved
    )
    assert first.status_code == repeated.status_code == 200

    stale = await client.put(
        "/api/v1/practice/python/progress/python-factorial",
        headers=headers,
        json=_progress(
            status="in_progress",
            attempts=2,
            draft="stale draft",
            updated_at=now - timedelta(minutes=1),
        ),
    )
    assert stale.json()["status"] == "solved"
    assert stale.json()["attempts"] == 4
    assert stale.json()["draft"] == "new draft"
    assert stale.json()["last_client_mutation_id"] == mutation_id


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_task_versions_keep_separate_progress(
    _mock_send: AsyncMock, client: pytest.fixture
) -> None:
    headers = await _auth(client, "practice-versions")
    for version in (1, 2):
        response = await client.put(
            "/api/v1/practice/python/progress/python-factorial",
            headers=headers,
            json=_progress(version=version, draft=f"version {version}"),
        )
        assert response.status_code == 200

    rows = (await client.get("/api/v1/practice/python/progress", headers=headers)).json()
    assert [(row["task_version"], row["draft"]) for row in rows] == [
        (1, "version 1"),
        (2, "version 2"),
    ]
