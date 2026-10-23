from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from httpx import AsyncClient
from sqlalchemy import func, select

from app.db.session import get_session_factory
from app.models.billing import (
    PaymentEvent,
    PromoCode,
    PromoKind,
    PromoRedemption,
    Referral,
    Subscription,
)
from app.models.user import User
from app.schemas.payments import CheckoutRequest, YooKassaNotification
from app.services.billing import BillingService


class FakeYooKassa:
    def __init__(self) -> None:
        self.created: dict[str, Any] | None = None
        self.remote: dict[str, Any] = {}

    async def create_payment(self, payload: dict[str, Any], idempotency_key: str) -> dict[str, Any]:
        self.created = payload
        return {
            "id": "yk-test-payment",
            "status": "pending",
            "confirmation": {"confirmation_url": "https://yookassa.test/pay"},
            "metadata": payload["metadata"],
            "amount": payload["amount"],
        }

    async def get_payment(self, payment_id: str) -> dict[str, Any]:
        assert payment_id == "yk-test-payment"
        return self.remote


async def register(client: AsyncClient, suffix: str) -> tuple[dict[str, str], str]:
    email = f"pay-{suffix}@example.com"
    response = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "Str0ngP@ss!", "username": f"pay-{suffix}"},
    )
    assert response.status_code == 201
    login = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": "Str0ngP@ss!"}
    )
    return {"Authorization": f"Bearer {login.json()['access_token']}"}, email


async def test_checkout_and_webhook_are_idempotent(client: AsyncClient) -> None:
    headers, email = await register(client, "cycle")
    fake = FakeYooKassa()
    async with get_session_factory()() as db:
        user = await db.scalar(select(User).where(User.email == email))
        assert user is not None
        service = BillingService(db, provider=fake)  # type: ignore[arg-type]
        checkout = await service.checkout(
            user,
            CheckoutRequest(
                plan_code="plus",
                interval="month",
                request_key="00000000-0000-4000-8000-000000000001",
            ),
        )
        await db.commit()
        assert checkout.amount == 29_900
        assert checkout.confirmation_url == "https://yookassa.test/pay"
        assert fake.created is not None
        assert fake.created["confirmation"]["type"] == "redirect"
        assert fake.created["description"] == "Запоминальня Plus, month"
        assert "payment_method_data" not in fake.created

        fake.remote = {
            "id": "yk-test-payment",
            "status": "succeeded",
            "captured_at": datetime.now(UTC).isoformat(),
            "amount": {"value": "299.00", "currency": "RUB"},
            "metadata": fake.created["metadata"],
        }
        notification = YooKassaNotification(
            type="notification",
            event="payment.succeeded",
            object={"id": "yk-test-payment"},
        )
        await service.webhook(notification)
        await db.commit()
        await service.webhook(notification)
        await db.commit()
        assert await db.scalar(select(func.count(PaymentEvent.id))) == 1
        subscription = await db.scalar(select(Subscription).where(Subscription.user_id == user.id))
        assert subscription is not None

    overview = await client.get("/api/v1/billing/overview", headers=headers)
    assert overview.status_code == 200
    assert overview.json()["subscription"]["plan_code"] == "plus"
    assert overview.json()["payments"][0]["status"] == "succeeded"


async def test_cancel_keeps_access_until_period_end(client: AsyncClient) -> None:
    headers, email = await register(client, "cancel")
    fake = FakeYooKassa()
    async with get_session_factory()() as db:
        user = await db.scalar(select(User).where(User.email == email))
        assert user is not None
        service = BillingService(db, provider=fake)  # type: ignore[arg-type]
        await service.checkout(
            user,
            CheckoutRequest(
                plan_code="pro",
                interval="year",
                request_key="00000000-0000-4000-8000-000000000002",
            ),
        )
        await db.commit()
        assert fake.created is not None
        fake.remote = {
            "id": "yk-test-payment",
            "status": "succeeded",
            "captured_at": datetime.now(UTC).isoformat(),
            "amount": {"value": "9999.00", "currency": "RUB"},
            "metadata": fake.created["metadata"],
        }
        await service.webhook(
            YooKassaNotification(
                type="notification",
                event="payment.succeeded",
                object={"id": "yk-test-payment"},
            )
        )
        await db.commit()

    canceled = await client.post("/api/v1/billing/cancel", headers=headers)
    assert canceled.status_code == 200
    assert canceled.json()["cancel_at_period_end"] is True
    entitlements = await client.get("/api/v1/billing/entitlements", headers=headers)
    assert entitlements.json()["plan_code"] == "pro"
    assert entitlements.json()["cancel_at_period_end"] is True


async def test_billing_overview_requires_current_user(client: AsyncClient) -> None:
    assert (await client.get("/api/v1/billing/overview")).status_code == 401


async def test_promo_and_referral_rewards_are_applied_after_payment(client: AsyncClient) -> None:
    _, inviter_email = await register(client, "inviter")
    _, invited_email = await register(client, "invited")
    fake = FakeYooKassa()
    async with get_session_factory()() as db:
        inviter = await db.scalar(select(User).where(User.email == inviter_email))
        invited = await db.scalar(select(User).where(User.email == invited_email))
        assert inviter is not None and invited is not None
        service = BillingService(db, provider=fake)  # type: ignore[arg-type]
        referral_code = await service.referral_code(inviter)
        await service.attach_referral(invited, referral_code)
        promo_code = f"FRIENDS-{uuid4().hex[:8].upper()}"
        db.add(PromoCode(code=promo_code, kind=PromoKind.percent, value=10))
        await db.flush()

        checkout = await service.checkout(
            invited,
            CheckoutRequest(
                plan_code="pro",
                interval="month",
                promo_code=promo_code.lower(),
                request_key="00000000-0000-4000-8000-000000000003",
            ),
        )
        await db.commit()
        assert checkout.amount == 89_910
        assert fake.created is not None
        fake.remote = {
            "id": "yk-test-payment",
            "status": "succeeded",
            "captured_at": datetime.now(UTC).isoformat(),
            "amount": {"value": "899.10", "currency": "RUB"},
            "metadata": fake.created["metadata"],
        }
        await service.webhook(
            YooKassaNotification(
                type="notification",
                event="payment.succeeded",
                object={"id": "yk-test-payment"},
            )
        )
        await db.commit()

        referral = await db.scalar(select(Referral).where(Referral.invited_user_id == invited.id))
        assert referral is not None and referral.status.value == "rewarded"
        assert await db.scalar(select(func.count(PromoRedemption.id))) == 1
        assert await db.scalar(select(func.count(Subscription.id))) == 3
