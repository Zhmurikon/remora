"""Дневная цель, серия, заморозки и XP считаются по принятым ответам."""

from datetime import UTC, datetime, time, timedelta
from unittest.mock import AsyncMock, patch
from zoneinfo import ZoneInfo

import pytest

from tests.test_study import _auth, _review, _set_with_cards


def _at(day, hour: int = 12) -> str:
    return datetime.combine(day, time(hour=hour), tzinfo=UTC).isoformat()


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_daily_goal_xp_and_duplicate_are_idempotent(
    _mock_send: AsyncMock, client: pytest.fixture
) -> None:
    headers = await _auth(client, "retention")
    other = await _auth(client, "retention-other")
    study_set = await _set_with_cards(client, headers, count=4)
    cards = study_set["cards"]
    assert (
        await client.patch("/api/v1/study/settings", headers=headers, json={"daily_goal_cards": 2})
    ).status_code == 200

    reviews = [
        _review(cards[0]["id"], duration_ms=1500),
        _review(cards[1]["id"], rating=1, duration_ms=1500),
        _review(cards[2]["id"], duration_ms=100),
    ]
    first = await client.post("/api/v1/study/reviews", headers=headers, json={"reviews": reviews})
    repeated = await client.post(
        "/api/v1/study/reviews", headers=headers, json={"reviews": reviews}
    )
    assert len(first.json()["accepted"]) == 3
    assert len(repeated.json()["duplicates"]) == 3

    summary = (await client.get("/api/v1/retention/summary", headers=headers)).json()
    assert summary["reviews_today"] == 3
    assert summary["correct_today"] == 2
    assert summary["xp_today"] == 15  # верный 10 + неверный 5; быстрый ответ без XP
    assert summary["total_xp"] == 15
    assert summary["goal_completed"] is True
    assert summary["current_streak_days"] == 1
    assert summary["level"] == 1

    isolated = (await client.get("/api/v1/retention/summary", headers=other)).json()
    assert isolated["reviews_today"] == isolated["total_xp"] == 0
    assert (await client.get("/api/v1/retention/summary")).status_code == 401


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_freezes_bridge_two_days_and_third_missed_day_breaks_streak(
    _mock_send: AsyncMock, client: pytest.fixture
) -> None:
    headers = await _auth(client, "freezes")
    study_set = await _set_with_cards(client, headers, count=4)
    cards = study_set["cards"]
    await client.patch("/api/v1/study/settings", headers=headers, json={"daily_goal_cards": 1})
    today = datetime.now(UTC).date()

    bridged = await client.post(
        "/api/v1/study/reviews",
        headers=headers,
        json={
            "reviews": [
                _review(cards[0]["id"], reviewed_at=_at(today - timedelta(days=3))),
                _review(cards[1]["id"], reviewed_at=_at(today)),
            ]
        },
    )
    assert len(bridged.json()["accepted"]) == 2
    summary = (await client.get("/api/v1/retention/summary", headers=headers)).json()
    assert summary["current_streak_days"] == 4
    assert summary["freezes_left"] == 0

    activity = (
        await client.get(
            "/api/v1/retention/activity",
            headers=headers,
            params={"from": today - timedelta(days=3), "to": today},
        )
    ).json()
    assert [day["is_frozen"] for day in activity] == [False, True, True, False]

    broken_headers = await _auth(client, "freezes-broken")
    broken_set = await _set_with_cards(client, broken_headers, count=4)
    broken_cards = broken_set["cards"]
    await client.patch(
        "/api/v1/study/settings", headers=broken_headers, json={"daily_goal_cards": 1}
    )
    await client.post(
        "/api/v1/study/reviews",
        headers=broken_headers,
        json={
            "reviews": [
                _review(broken_cards[0]["id"], reviewed_at=_at(today - timedelta(days=4))),
                _review(broken_cards[1]["id"], reviewed_at=_at(today)),
            ]
        },
    )
    broken = (await client.get("/api/v1/retention/summary", headers=broken_headers)).json()
    assert broken["current_streak_days"] == 1
    assert broken["longest_streak_days"] == 3


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_activity_range_validation(_mock_send: AsyncMock, client: pytest.fixture) -> None:
    headers = await _auth(client, "retention-range")
    today = datetime.now(UTC).date()
    response = await client.get(
        "/api/v1/retention/activity",
        headers=headers,
        params={"from": today, "to": today - timedelta(days=1)},
    )
    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_ERROR"


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_activity_uses_user_timezone_and_xp_diminishes(
    _mock_send: AsyncMock, client: pytest.fixture
) -> None:
    headers = await _auth(client, "retention-timezone")
    profile = await client.patch(
        "/api/v1/auth/me",
        headers=headers,
        json={
            "username": "studyretention-timezone",
            "display_name": "Часовой пояс",
            "locale": "ru",
            "timezone": "Asia/Vladivostok",
        },
    )
    assert profile.status_code == 200
    study_set = await _set_with_cards(client, headers, count=55)
    local_today = datetime.now(ZoneInfo("Asia/Vladivostok")).date()
    local_moment = datetime.combine(local_today, time(hour=1), tzinfo=ZoneInfo("Asia/Vladivostok"))
    reviews = [
        _review(card["id"], reviewed_at=(local_moment + timedelta(seconds=index)).isoformat())
        for index, card in enumerate(study_set["cards"])
    ]
    response = await client.post(
        "/api/v1/study/reviews", headers=headers, json={"reviews": reviews}
    )
    assert len(response.json()["accepted"]) == 55

    summary = (await client.get("/api/v1/retention/summary", headers=headers)).json()
    assert summary["date"] == local_today.isoformat()
    assert summary["reviews_today"] == 55
    # 20 × 10 XP, следующие 30 × 5, затем по 1 XP.
    assert summary["xp_today"] == 355
