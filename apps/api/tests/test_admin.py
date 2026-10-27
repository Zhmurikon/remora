"""Админ-панель: безопасное чтение и строгая проверка роли."""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

from httpx import AsyncClient
from sqlalchemy import select, update

from app.db.session import get_engine, get_session_factory
from app.models.billing import (
    BillingInterval,
    Entitlement,
    EntitlementSource,
    Payment,
    PaymentStatus,
    Plan,
    PromoCode,
    PromoKind,
    PromoRedemption,
    ReferralCode,
    Subscription,
    SubscriptionStatus,
)
from app.models.tts import UsageCounter
from app.models.user import User, UserRole
from app.services.plans import sync_plan_catalog
from tests.test_courses import auth


async def promote(username: str, role: UserRole) -> None:
    async with get_engine().begin() as conn:
        await conn.execute(update(User).where(User.username == username).values(role=role))


async def test_admin_endpoints_require_admin_role(client: AsyncClient) -> None:
    regular = await auth(client, "admin-regular")
    moderator = await auth(client, "admin-moderator")
    await promote("courseadmin-moderator", UserRole.moderator)

    for path in (
        "/api/v1/admin/overview",
        "/api/v1/admin/users",
        "/api/v1/admin/users/11111111-1111-4111-8111-111111111111",
    ):
        assert (await client.get(path)).status_code == 401
        for headers in (regular, moderator):
            response = await client.get(path, headers=headers)
            assert response.status_code == 403
            assert response.json()["code"] == "FORBIDDEN"


async def test_admin_sees_overview_and_searchable_users(client: AsyncClient) -> None:
    admin_headers = await auth(client, "admin-owner")
    await promote("courseadmin-owner", UserRole.admin)
    creator_headers = await auth(client, "admin-creator")
    await client.post("/api/v1/sets", headers=creator_headers, json={"title": "Набор автора"})

    overview = await client.get("/api/v1/admin/overview", headers=admin_headers)
    assert overview.status_code == 200, overview.text
    payload = overview.json()
    assert payload["users_total"] == 2
    assert payload["users_new_7d"] == 2
    assert payload["users_active_7d"] == 0
    assert payload["reviews_7d"] == 0
    assert payload["sets_total"] == 1
    assert payload["courses_total"] == 0
    assert payload["courses_published"] == 0
    assert payload["reports_open"] == 0

    users = await client.get("/api/v1/admin/users?query=admin-creator", headers=admin_headers)
    assert users.status_code == 200, users.text
    body = users.json()
    assert body["total"] == 1
    assert body["offset"] == 0
    assert body["limit"] == 25
    assert body["items"][0]["username"] == "courseadmin-creator"
    assert body["items"][0]["email"] == "course-admin-creator@example.com"
    assert body["items"][0]["sets_count"] == 1
    assert body["items"][0]["courses_count"] == 0
    assert body["items"][0]["reviews_count"] == 0
    assert "password_hash" not in body["items"][0]

    missing = await client.get(
        "/api/v1/admin/users?query=такого-пользователя-нет", headers=admin_headers
    )
    assert missing.status_code == 200
    assert missing.json()["items"] == []
    assert missing.json()["total"] == 0


async def test_admin_sees_user_card_without_sensitive_fields(client: AsyncClient) -> None:
    suffix = uuid4().hex[:8]
    owner_suffix = f"admin-owner-{suffix}"
    target_suffix = f"admin-target-{suffix}"
    target_username = f"course{target_suffix}"
    admin_headers = await auth(client, owner_suffix)
    await promote(f"course{owner_suffix}", UserRole.admin)
    target_headers = await auth(client, target_suffix)
    await client.post(
        "/api/v1/sets",
        headers=target_headers,
        json={"title": "Карточки пользователя"},
    )

    now = datetime.now(UTC)
    promo_code = f"ADMIN-{suffix.upper()}"
    referral_code = f"RMR-{suffix.upper()}"
    async with get_session_factory()() as db:
        await sync_plan_catalog(db)
        target = await db.scalar(select(User).where(User.username == target_username))
        plus = await db.scalar(select(Plan).where(Plan.code == "plus", Plan.active.is_(True)))
        assert target is not None and plus is not None
        subscription = Subscription(
            user_id=target.id,
            plan_id=plus.id,
            status=SubscriptionStatus.active,
            interval=BillingInterval.month,
            current_period_start=now,
            current_period_end=now + timedelta(days=30),
        )
        promo = PromoCode(code=promo_code, kind=PromoKind.percent, value=20, starts_at=now)
        db.add_all([subscription, promo])
        await db.flush()
        db.add_all(
            [
                Entitlement(
                    user_id=target.id,
                    key="limit.ai.generation_tokens_per_week",
                    value=750_000,
                    source=EntitlementSource.admin,
                    reason="Индивидуальная квота",
                    starts_at=now,
                ),
                UsageCounter(
                    user_id=target.id,
                    metric="agent.writes_per_week",
                    period_key="2026-W44",
                    value=12,
                ),
                Payment(
                    user_id=target.id,
                    plan_id=plus.id,
                    interval=BillingInterval.month,
                    status=PaymentStatus.succeeded,
                    amount=23_920,
                    discount_amount=5_980,
                    idempotency_key=f"admin-user-card-{suffix}",
                    promo_code_id=promo.id,
                    paid_at=now,
                ),
                PromoRedemption(promo_code_id=promo.id, user_id=target.id),
                ReferralCode(user_id=target.id, code=referral_code),
            ]
        )
        await db.commit()
        target_id = target.id

    response = await client.get(f"/api/v1/admin/users/{target_id}", headers=admin_headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["username"] == target_username
    assert body["materials"]["sets_total"] == 1
    assert body["materials"]["recent"][0]["title"] == "Карточки пользователя"
    assert body["access"]["plan_code"] == "plus"
    assert body["access"]["usage"]["agent.writes_per_week"] == 12
    assert body["access"]["overrides"][0]["reason"] == "Индивидуальная квота"
    assert body["payments"][0]["promo_code"] == promo_code
    assert body["promo_redemptions"][0]["code"] == promo_code
    assert body["referral"]["code"] == referral_code
    assert "password_hash" not in body
    assert "provider_payload" not in body["payments"][0]

    missing = await client.get(
        "/api/v1/admin/users/11111111-1111-4111-8111-111111111111",
        headers=admin_headers,
    )
    assert missing.status_code == 404
    assert missing.json()["code"] == "NOT_FOUND"
