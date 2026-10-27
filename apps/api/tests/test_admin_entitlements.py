"""Диагностика тарифов, персональных прав и квот в админке."""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

from httpx import AsyncClient
from sqlalchemy import select

from app.db.session import get_session_factory
from app.models.billing import (
    BillingInterval,
    Entitlement,
    EntitlementSource,
    Plan,
    Subscription,
    SubscriptionStatus,
)
from app.models.user import User, UserRole
from app.services.plans import sync_plan_catalog
from tests.test_admin import promote, verified_admin_headers
from tests.test_courses import auth


async def test_admin_sees_active_plan_versions(client: AsyncClient) -> None:
    await auth(client, "plan-catalog-admin")
    await promote("courseplan-catalog-admin", UserRole.admin)
    headers = await verified_admin_headers("courseplan-catalog-admin")
    async with get_session_factory()() as db:
        await sync_plan_catalog(db)
        await db.commit()

    response = await client.get("/api/v1/admin/plans", headers=headers)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["catalog_version"] == 1
    assert body["source"] == "app/config/plans.yaml"
    assert [item["code"] for item in body["items"]] == ["free", "plus", "pro"]
    assert all(item["version"] == 1 for item in body["items"])
    assert all(item["matches_catalog"] is True for item in body["items"])
    assert "features" in body["items"][0]
    assert "limits" in body["items"][0]

    assert (await client.get("/api/v1/admin/plans")).status_code == 401


async def test_admin_sees_resolution_chain_and_entitlement_history(client: AsyncClient) -> None:
    suffix = uuid4().hex[:8]
    await auth(client, f"rights-admin-{suffix}")
    admin_username = f"courserights-admin-{suffix}"
    await promote(admin_username, UserRole.admin)
    headers = await verified_admin_headers(admin_username)
    await auth(client, f"rights-user-{suffix}")
    target_username = f"courserights-user-{suffix}"
    now = datetime.now(UTC)

    async with get_session_factory()() as db:
        await sync_plan_catalog(db)
        target = await db.scalar(select(User).where(User.username == target_username))
        plus = await db.scalar(select(Plan).where(Plan.code == "plus", Plan.active.is_(True)))
        assert target is not None and plus is not None
        db.add(
            Subscription(
                user_id=target.id,
                plan_id=plus.id,
                status=SubscriptionStatus.active,
                interval=BillingInterval.month,
                current_period_start=now - timedelta(days=1),
                current_period_end=now + timedelta(days=29),
            )
        )
        db.add_all(
            [
                Entitlement(
                    user_id=target.id,
                    key="limit.tts.chars_per_month",
                    value=200_000,
                    source=EntitlementSource.admin,
                    reason="Увеличенная квота для курса",
                    starts_at=now - timedelta(days=2),
                ),
                Entitlement(
                    user_id=target.id,
                    key="feature.ai.generation",
                    value=False,
                    source=EntitlementSource.admin,
                    reason="Временное ограничение завершено",
                    starts_at=now - timedelta(days=5),
                    valid_until=now - timedelta(days=1),
                ),
            ]
        )
        await db.commit()
        target_id = target.id

    response = await client.get(f"/api/v1/admin/users/{target_id}", headers=headers)

    assert response.status_code == 200, response.text
    access = response.json()["access"]
    assert access["plan_code"] == "plus"
    assert access["plan_version"] == 1
    decisions = {item["key"]: item for item in access["decisions"]}
    assert decisions["limit.tts.chars_per_month"] == {
        "key": "limit.tts.chars_per_month",
        "kind": "limit",
        "value": 200_000,
        "source": "override",
        "source_label": "Персональное право",
        "reason": "Увеличенная квота для курса",
    }
    assert decisions["feature.classes.xlsx_export"]["source"] == "plan"
    assert decisions["feature.classes.xlsx_export"]["source_label"] == "Тариф Plus v1"
    assert len(access["history"]) == 2
    assert {item["status"] for item in access["history"]} == {"active", "expired"}
    assert sum(item["revocable"] for item in access["history"]) == 1
