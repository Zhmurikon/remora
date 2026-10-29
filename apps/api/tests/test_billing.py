from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
import yaml
from httpx import AsyncClient
from sqlalchemy import select

from app.core.errors import LimitExceededError
from app.db.session import get_session_factory
from app.models.billing import (
    BillingInterval,
    Entitlement,
    EntitlementSource,
    Plan,
    Subscription,
    SubscriptionStatus,
)
from app.models.tts import UsageCounter
from app.models.user import User
from app.services.entitlements import Entitlements, load_plan_catalog, week_period
from app.services.plans import public_plans, sync_plan_catalog


async def register(client: AsyncClient, suffix: str) -> tuple[dict[str, str], str]:
    email = f"billing-{suffix}@example.com"
    response = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "Str0ngP@ss!", "username": f"bill-{suffix}"},
    )
    assert response.status_code == 201
    login = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": "Str0ngP@ss!"}
    )
    return {"Authorization": f"Bearer {login.json()['access_token']}"}, email


async def test_public_plan_catalog_has_launch_prices(client: AsyncClient) -> None:
    response = await client.get("/api/v1/billing/plans")
    assert response.status_code == 200
    plans = {item["code"]: item for item in response.json()}
    assert set(plans) == {"free", "plus", "pro"}
    assert plans["plus"]["price_month"] == 29_900
    assert plans["plus"]["price_year"] == 249_900
    assert plans["pro"]["price_month"] == 99_900
    assert plans["pro"]["price_year"] == 999_900
    assert plans["free"]["features"]["ai.transcription"] is False
    assert plans["free"]["limits"]["tts.chars_per_month"] == 5_000
    assert plans["free"]["limits"]["export.account_per_day"] == 1
    assert plans["plus"]["limits"]["tts.chars_per_month"] == 150_000
    assert plans["plus"]["limits"]["export.account_per_day"] is None


def test_catalog_numbers_change_from_yaml_without_code_changes(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    source = Path(__file__).parents[1] / "app" / "config" / "plans.yaml"
    catalog = yaml.safe_load(source.read_text(encoding="utf-8"))
    catalog["version"] += 1
    catalog["plans"]["free"]["limits"]["courses.total"] = 7
    changed = tmp_path / "plans.yaml"
    changed.write_text(yaml.safe_dump(catalog, allow_unicode=True), encoding="utf-8")

    monkeypatch.setattr("app.services.entitlements.PLAN_CATALOG_PATH", changed)
    load_plan_catalog.cache_clear()
    try:
        free = next(plan for plan in public_plans() if plan.code == "free")
        assert free.limits["courses.total"] == 7
    finally:
        load_plan_catalog.cache_clear()


async def test_free_entitlements_are_private_to_current_user(client: AsyncClient) -> None:
    headers, _ = await register(client, "free")
    response = await client.get("/api/v1/billing/entitlements", headers=headers)
    assert response.status_code == 200
    assert response.json()["plan_code"] == "free"
    assert response.json()["limits"]["sets.library_total"] == 20
    assert response.json()["limits"]["courses.total"] == 10
    assert response.json()["limits"]["study.reviews_soft_per_day"] == 500
    assert response.json()["usage"] == {
        "courses.total": 0,
        "sets.library_total": 0,
        "agent.writes_per_week": 0,
        "ai.transcription_minutes_per_week": 0,
        "ai.generation_tokens_per_week": 0,
    }
    assert response.json()["remaining"] == {
        "courses.total": 10,
        "sets.library_total": 20,
        "agent.writes_per_week": 500,
        "ai.transcription_minutes_per_week": 0,
        "ai.generation_tokens_per_week": 0,
    }
    assert response.json()["resets_at"]["ai.transcription_minutes_per_week"] is not None
    assert (await client.get("/api/v1/billing/entitlements")).status_code == 401


async def test_subscription_snapshot_and_personal_override(client: AsyncClient) -> None:
    headers, email = await register(client, "plus")
    now = datetime.now(UTC)
    async with get_session_factory()() as db:
        await sync_plan_catalog(db)
        user = await db.scalar(select(User).where(User.email == email))
        plan = await db.scalar(select(Plan).where(Plan.code == "plus", Plan.active.is_(True)))
        assert user is not None and plan is not None
        db.add(
            Subscription(
                user_id=user.id,
                plan_id=plan.id,
                status=SubscriptionStatus.active,
                interval=BillingInterval.month,
                current_period_start=now,
                current_period_end=now + timedelta(days=30),
            )
        )
        db.add(
            Entitlement(
                user_id=user.id,
                key="limit.ai.transcription_minutes_per_week",
                value=450,
                source=EntitlementSource.grandfathering,
                reason="Сохранены прежние условия",
                starts_at=now - timedelta(days=1),
            )
        )
        await db.commit()

    response = await client.get("/api/v1/billing/entitlements", headers=headers)
    assert response.status_code == 200
    assert response.json()["plan_code"] == "plus"
    assert response.json()["features"]["classes.xlsx_export"] is True
    assert response.json()["limits"]["ai.transcription_minutes_per_week"] == 450


async def test_weekly_counter_rejects_only_metered_agent_writes(client: AsyncClient) -> None:
    _, email = await register(client, "counter")
    period_key, resets_at = week_period()
    async with get_session_factory()() as db:
        user = await db.scalar(select(User).where(User.email == email))
        assert user is not None
        db.add(
            UsageCounter(
                user_id=user.id,
                metric="agent.writes_per_week",
                period_key=period_key,
                value=500,
            )
        )
        await db.commit()
        with pytest.raises(LimitExceededError) as raised:
            await Entitlements(db).consume(
                user,
                "agent.writes_per_week",
                amount=1,
                period_key=period_key,
                resets_at=resets_at,
            )
        assert raised.value.details["limit_key"] == "agent.writes_per_week"
        assert raised.value.details["resets_at"] == resets_at.isoformat()
