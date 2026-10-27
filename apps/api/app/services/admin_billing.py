"""Просмотр и защищённые операции административного биллинга."""

import hashlib
import json
from contextlib import suppress
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, NotFoundError, ValidationError
from app.models.billing import Payment, PaymentStatus, SubscriptionStatus
from app.models.user import User
from app.repositories import admin_billing as repo
from app.repositories import admin_security as security_repo
from app.schemas.admin_billing import (
    AdminPaymentAuditItem,
    AdminPaymentDetail,
    AdminPaymentEventItem,
    AdminPaymentItem,
    AdminPaymentList,
    AdminPaymentRefund,
    AdminSubscriptionItem,
)
from app.services.billing import BillingService
from app.services.yookassa import YooKassaClient


class AdminBillingService:
    def __init__(self, db: AsyncSession, provider: YooKassaClient | None = None) -> None:
        self.db = db
        self.provider = provider or YooKassaClient()

    async def payments(
        self, *, query: str | None, status: str | None, offset: int, limit: int
    ) -> AdminPaymentList:
        records, total = await repo.payments(
            self.db, query=query, status=status, offset=offset, limit=limit
        )
        return AdminPaymentList(
            items=[self._item(record) for record in records],
            total=total,
            offset=offset,
            limit=limit,
        )

    async def payment(self, payment_id: UUID) -> AdminPaymentDetail:
        record = await repo.payment(self.db, payment_id)
        if record is None:
            raise NotFoundError("Платёж не найден")
        events = await repo.payment_events(self.db, payment_id)
        subscriptions = await repo.subscriptions(self.db, record.user.id)
        history = await security_repo.target_history(
            self.db, target_type="payment", target_id=payment_id
        )
        for subscription in subscriptions:
            history.extend(
                await security_repo.target_history(
                    self.db,
                    target_type="subscription",
                    target_id=subscription.subscription.id,
                )
            )
        history.sort(key=lambda item: (item[0].created_at, item[0].id), reverse=True)
        return AdminPaymentDetail(
            **self._item(record).model_dump(),
            receipt_url=record.payment.receipt_url,
            subscriptions=[self._subscription(item) for item in subscriptions],
            events=[
                AdminPaymentEventItem(
                    id=item.id,
                    event=item.event,
                    provider_payment_id=item.provider_payment_id,
                    received_at=item.received_at,
                    processed_at=item.processed_at,
                )
                for item in events
            ],
            history=[
                AdminPaymentAuditItem(
                    id=item.id,
                    action=item.action,
                    actor_username=username,
                    reason=item.reason,
                    created_at=item.created_at,
                )
                for item, username in history
            ],
        )

    async def refund(
        self,
        *,
        actor: User,
        payment_id: UUID,
        reason: str,
        idempotency_key: str,
        ip: str | None,
        user_agent: str | None,
    ) -> AdminPaymentDetail:
        record = await repo.payment(self.db, payment_id, lock=True)
        if record is None:
            raise NotFoundError("Платёж не найден")
        payload = {"reason": reason, "amount": record.payment.amount}
        if await self._repeated(
            actor, "admin.billing.refund_requested", "payment", payment_id, payload, idempotency_key
        ):
            return await self.payment(payment_id)
        payment = record.payment
        if payment.status is not PaymentStatus.succeeded or payment.provider_payment_id is None:
            raise ConflictError("Возврат доступен только для успешно оплаченного платежа")
        previous_refund = self._refund(payment)
        if previous_refund is not None and previous_refund.status in {"pending", "succeeded"}:
            raise ConflictError("Возврат по платежу уже создан")
        remote = await self.provider.create_refund(
            {
                "payment_id": payment.provider_payment_id,
                "amount": {
                    "value": f"{Decimal(payment.amount) / 100:.2f}",
                    "currency": payment.currency,
                },
                "description": "Возврат платежа Запоминальни",
            },
            idempotency_key,
        )
        self._validate_refund_response(payment, remote)
        payment.provider_payload = {**payment.provider_payload, "refund_request": remote}
        await self._audit(
            actor=actor,
            action="admin.billing.refund_requested",
            target_type="payment",
            target_id=payment.id,
            reason=reason,
            idempotency_key=idempotency_key,
            ip=ip,
            user_agent=user_agent,
            payload=payload,
            details={
                "provider_refund_id": str(remote["id"]),
                "refund_status": str(remote["status"]),
                "amount": payment.amount,
                "currency": payment.currency,
            },
        )
        return await self.payment(payment_id)

    async def cancel_subscription(
        self,
        *,
        actor: User,
        subscription_id: UUID,
        reason: str,
        idempotency_key: str,
        ip: str | None,
        user_agent: str | None,
    ) -> AdminSubscriptionItem:
        record = await repo.subscription_for_update(self.db, subscription_id)
        if record is None:
            raise NotFoundError("Подписка не найдена")
        payload = {"reason": reason}
        if await self._repeated(
            actor,
            "admin.billing.subscription_canceled",
            "subscription",
            subscription_id,
            payload,
            idempotency_key,
        ):
            return self._subscription(record)
        subscription = record.subscription
        if subscription.status is SubscriptionStatus.expired:
            raise ConflictError("Подписка уже завершена")
        if subscription.cancel_at_period_end and subscription.status is SubscriptionStatus.canceled:
            raise ConflictError("Продление подписки уже отменено")
        previous_status = subscription.status.value
        subscription.status = SubscriptionStatus.canceled
        subscription.cancel_at_period_end = True
        await self._audit(
            actor=actor,
            action="admin.billing.subscription_canceled",
            target_type="subscription",
            target_id=subscription.id,
            reason=reason,
            idempotency_key=idempotency_key,
            ip=ip,
            user_agent=user_agent,
            payload=payload,
            details={
                "user_id": str(subscription.user_id),
                "plan_code": record.plan.code,
                "old_status": previous_status,
                "current_period_end": subscription.current_period_end.isoformat(),
            },
        )
        return self._subscription(record)

    async def retry_event(
        self,
        *,
        actor: User,
        event_id: UUID,
        reason: str,
        idempotency_key: str,
        ip: str | None,
        user_agent: str | None,
    ) -> AdminPaymentDetail:
        event = await repo.event_for_update(self.db, event_id)
        if event is None or event.payment_id is None:
            raise NotFoundError("Событие платежа не найдено")
        payload = {"reason": reason, "event_id": event_id}
        if await self._repeated(
            actor,
            "admin.billing.event_retried",
            "payment",
            event.payment_id,
            payload,
            idempotency_key,
        ):
            return await self.payment(event.payment_id)
        await BillingService(self.db, provider=self.provider).retry_event(event)
        await self._audit(
            actor=actor,
            action="admin.billing.event_retried",
            target_type="payment",
            target_id=event.payment_id,
            reason=reason,
            idempotency_key=idempotency_key,
            ip=ip,
            user_agent=user_agent,
            payload=payload,
            details={"event_id": str(event.id), "event": event.event},
        )
        return await self.payment(event.payment_id)

    async def _audit(
        self,
        *,
        actor: User,
        action: str,
        target_type: str,
        target_id: UUID,
        reason: str,
        idempotency_key: str,
        ip: str | None,
        user_agent: str | None,
        payload: dict[str, Any],
        details: dict[str, object],
    ) -> None:
        await security_repo.add_audit(
            self.db,
            actor_user_id=actor.id,
            action=action,
            outcome="success",
            target_type=target_type,
            target_id=target_id,
            reason=reason,
            idempotency_key=idempotency_key,
            ip=ip,
            user_agent=user_agent,
            details={
                "request_hash": self._request_hash(action, target_id, payload),
                **details,
            },
        )

    async def _repeated(
        self,
        actor: User,
        action: str,
        target_type: str,
        target_id: UUID,
        payload: dict[str, Any],
        idempotency_key: str,
    ) -> bool:
        existing = await security_repo.get_audit_by_idempotency(self.db, idempotency_key)
        if existing is None:
            return False
        expected = self._request_hash(action, target_id, payload)
        if (
            existing.actor_user_id != actor.id
            or existing.action != action
            or existing.target_type != target_type
            or existing.target_id != target_id
            or existing.details.get("request_hash") != expected
        ):
            raise ConflictError("Ключ идемпотентности уже использован для другого действия")
        return True

    @staticmethod
    def _request_hash(action: str, target_id: UUID, payload: dict[str, Any]) -> str:
        value = json.dumps(
            {"action": action, "target_id": str(target_id), "payload": payload},
            sort_keys=True,
            ensure_ascii=False,
            default=str,
            separators=(",", ":"),
        )
        return hashlib.sha256(value.encode()).hexdigest()

    @classmethod
    def _item(cls, record: repo.PaymentRecord) -> AdminPaymentItem:
        return AdminPaymentItem(
            id=record.payment.id,
            provider_payment_id=record.payment.provider_payment_id,
            user_id=record.user.id,
            username=record.user.username,
            email=record.user.email,
            plan_code=record.plan.code,
            plan_name=record.plan.name,
            interval=record.payment.interval.value,
            status=record.payment.status.value,
            amount=record.payment.amount,
            discount_amount=record.payment.discount_amount,
            currency=record.payment.currency,
            created_at=record.payment.created_at,
            paid_at=record.payment.paid_at,
            refund=cls._refund(record.payment),
        )

    @staticmethod
    def _subscription(record: repo.SubscriptionRecord) -> AdminSubscriptionItem:
        item = record.subscription
        return AdminSubscriptionItem(
            id=item.id,
            plan_code=record.plan.code,
            plan_name=record.plan.name,
            status=item.status.value,
            interval=item.interval.value,
            current_period_start=item.current_period_start,
            current_period_end=item.current_period_end,
            cancel_at_period_end=item.cancel_at_period_end,
            ended_at=item.ended_at,
        )

    @staticmethod
    def _refund(payment: Payment) -> AdminPaymentRefund | None:
        value = payment.provider_payload.get("refund") or payment.provider_payload.get(
            "refund_request"
        )
        if not isinstance(value, dict):
            return None
        amount: int | None = None
        raw_amount = value.get("amount")
        if isinstance(raw_amount, dict):
            with suppress(InvalidOperation, TypeError, ValueError):
                amount = int(Decimal(str(raw_amount.get("value"))) * 100)
        created_at: datetime | None = None
        raw_created_at = value.get("created_at")
        if isinstance(raw_created_at, str):
            with suppress(ValueError):
                created_at = datetime.fromisoformat(raw_created_at.replace("Z", "+00:00"))
        return AdminPaymentRefund(
            provider_refund_id=str(value["id"]) if value.get("id") else None,
            status=str(value.get("status", "unknown")),
            amount=amount,
            created_at=created_at,
        )

    @staticmethod
    def _validate_refund_response(payment: Payment, response: dict[str, Any]) -> None:
        try:
            amount = Decimal(str(response["amount"]["value"]))
        except (KeyError, TypeError, InvalidOperation) as exc:
            raise ValidationError("ЮKassa вернула неполный ответ на возврат") from exc
        if (
            not response.get("id")
            or response.get("status") not in {"pending", "succeeded", "canceled"}
            or response.get("payment_id") != payment.provider_payment_id
            or response["amount"].get("currency") != payment.currency
            or amount != Decimal(payment.amount) / 100
        ):
            raise ValidationError("Параметры возврата не совпадают с платежом")
