"""Платежи и подписки в административной панели."""

import hashlib
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select

from app.db.session import get_session_factory
from app.models.admin_security import AdminAuditLog
from app.models.billing import (
    BillingInterval,
    Payment,
    PaymentEvent,
    PaymentStatus,
    Plan,
    Subscription,
    SubscriptionStatus,
)
from app.models.user import User, UserRole
from app.services.plans import sync_plan_catalog
from tests.test_admin import promote, verified_admin_headers
from tests.test_admin_user_management import mutation_headers
from tests.test_courses import auth


async def _user(username: str) -> User:
    async with get_session_factory()() as db:
        user = await db.scalar(select(User).where(User.username == username))
        assert user is not None
        return user


async def _payment(
    user_id: UUID,
    *,
    provider_id: str,
    status: PaymentStatus,
) -> tuple[UUID, UUID]:
    async with get_session_factory()() as db:
        await sync_plan_catalog(db)
        plan = await db.scalar(select(Plan).where(Plan.code == "plus", Plan.active.is_(True)))
        assert plan is not None
        now = datetime.now(UTC)
        payment = Payment(
            user_id=user_id,
            plan_id=plan.id,
            interval=BillingInterval.month,
            status=status,
            amount=29_900,
            provider_payment_id=provider_id,
            idempotency_key=f"checkout-{uuid4()}",
            provider_payload={"payment_method": {"id": "must-not-leak"}},
            paid_at=now if status is PaymentStatus.succeeded else None,
        )
        db.add(payment)
        await db.flush()
        subscription = Subscription(
            user_id=user_id,
            plan_id=plan.id,
            status=SubscriptionStatus.active,
            interval=BillingInterval.month,
            current_period_start=now,
            current_period_end=now + timedelta(days=30),
        )
        db.add(subscription)
        await db.commit()
        return payment.id, subscription.id


async def test_admin_lists_payment_detail_without_provider_payload(client: AsyncClient) -> None:
    suffix = uuid4().hex[:8]
    admin_username = f"coursebilling-admin-{suffix}"
    customer_username = f"coursebilling-customer-{suffix}"
    await auth(client, f"billing-admin-{suffix}")
    await auth(client, f"billing-customer-{suffix}")
    await promote(admin_username, UserRole.admin)
    customer = await _user(customer_username)
    payment_id, _ = await _payment(
        customer.id, provider_id=f"yk-list-{suffix}", status=PaymentStatus.succeeded
    )

    regular = await auth(client, f"billing-regular-{suffix}")
    assert (await client.get("/api/v1/admin/billing/payments", headers=regular)).status_code == 403

    headers = await verified_admin_headers(admin_username)
    listed = await client.get(
        f"/api/v1/admin/billing/payments?query=yk-list-{suffix}&status=succeeded",
        headers=headers,
    )
    assert listed.status_code == 200, listed.text
    assert listed.json()["total"] == 1
    assert listed.json()["items"][0]["username"] == customer_username

    detail = await client.get(f"/api/v1/admin/billing/payments/{payment_id}", headers=headers)
    assert detail.status_code == 200, detail.text
    body = detail.json()
    assert body["provider_payment_id"] == f"yk-list-{suffix}"
    assert body["subscriptions"][0]["status"] == "active"
    assert "provider_payload" not in body
    assert "must-not-leak" not in detail.text


async def test_admin_refunds_cancels_and_retries_event(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    suffix = uuid4().hex[:8]
    admin_username = f"coursebilling-actions-{suffix}"
    customer_username = f"coursebilling-target-{suffix}"
    await auth(client, f"billing-actions-{suffix}")
    await auth(client, f"billing-target-{suffix}")
    await promote(admin_username, UserRole.admin)
    customer = await _user(customer_username)
    payment_id, subscription_id = await _payment(
        customer.id, provider_id=f"yk-refund-{suffix}", status=PaymentStatus.succeeded
    )

    refund_calls = 0

    async def create_refund(
        _self: object, payload: dict[str, object], _key: str
    ) -> dict[str, object]:
        nonlocal refund_calls
        refund_calls += 1
        assert payload["description"] == "Возврат платежа Запоминальни"
        return {
            "id": f"yk-refund-result-{suffix}",
            "status": "pending",
            "payment_id": f"yk-refund-{suffix}",
            "amount": payload["amount"],
            "created_at": datetime.now(UTC).isoformat(),
        }

    monkeypatch.setattr("app.services.yookassa.YooKassaClient.create_refund", create_refund)

    unconfirmed = await client.post(
        f"/api/v1/admin/billing/payments/{payment_id}/refund",
        headers={
            **(await verified_admin_headers(admin_username)),
            "Idempotency-Key": f"refund-unconfirmed-{uuid4()}",
        },
        json={"reason": "Возврат по обращению пользователя"},
    )
    assert unconfirmed.status_code == 403

    refund_key = f"refund-{uuid4()}"
    refund_headers = await mutation_headers(admin_username, refund_key)
    refunded = await client.post(
        f"/api/v1/admin/billing/payments/{payment_id}/refund",
        headers=refund_headers,
        json={"reason": "Возврат по обращению пользователя"},
    )
    assert refunded.status_code == 200, refunded.text
    assert refunded.json()["refund"]["status"] == "pending"
    repeated = await client.post(
        f"/api/v1/admin/billing/payments/{payment_id}/refund",
        headers=refund_headers,
        json={"reason": "Возврат по обращению пользователя"},
    )
    assert repeated.status_code == 200
    assert refund_calls == 1

    canceled = await client.post(
        f"/api/v1/admin/billing/subscriptions/{subscription_id}/cancel",
        headers=await mutation_headers(admin_username, f"cancel-{uuid4()}"),
        json={"reason": "Отключение продления по обращению пользователя"},
    )
    assert canceled.status_code == 200, canceled.text
    assert canceled.json()["status"] == "canceled"
    assert canceled.json()["cancel_at_period_end"] is True

    async with get_session_factory()() as db:
        payment = await db.get(Payment, payment_id)
        assert payment is not None
        event = PaymentEvent(
            fingerprint=hashlib.sha256(
                f"payment.succeeded:yk-refund-{suffix}".encode()
            ).hexdigest(),
            event="payment.succeeded",
            provider_payment_id=f"yk-refund-{suffix}",
            payment_id=payment.id,
            payload={
                "type": "notification",
                "event": "payment.succeeded",
                "object": {"id": f"yk-refund-{suffix}"},
            },
        )
        db.add(event)
        await db.commit()
        event_id = event.id

    async def get_payment(_self: object, provider_id: str) -> dict[str, object]:
        assert provider_id == f"yk-refund-{suffix}"
        return {
            "id": provider_id,
            "status": "succeeded",
            "captured_at": datetime.now(UTC).isoformat(),
            "amount": {"value": "299.00", "currency": "RUB"},
            "metadata": {"payment_id": str(payment_id)},
        }

    monkeypatch.setattr("app.services.yookassa.YooKassaClient.get_payment", get_payment)
    retried = await client.post(
        f"/api/v1/admin/billing/events/{event_id}/retry",
        headers=await mutation_headers(admin_username, f"retry-{uuid4()}"),
        json={"reason": "Повтор после временной ошибки провайдера"},
    )
    assert retried.status_code == 200, retried.text
    retried_event = next(item for item in retried.json()["events"] if item["id"] == str(event_id))
    assert retried_event["processed_at"] is not None

    async with get_session_factory()() as db:
        audits = await db.scalar(
            select(func.count(AdminAuditLog.id)).where(
                AdminAuditLog.action.in_(
                    [
                        "admin.billing.refund_requested",
                        "admin.billing.subscription_canceled",
                        "admin.billing.event_retried",
                    ]
                )
            )
        )
        assert audits == 3
