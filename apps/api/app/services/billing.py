from __future__ import annotations

import calendar
import hashlib
import re
import secrets
import string
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any
from uuid import uuid4

from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import ConflictError, NotFoundError, ValidationError
from app.models.billing import (
    BillingInterval,
    Payment,
    PaymentEvent,
    PaymentStatus,
    Plan,
    PromoCode,
    PromoKind,
    PromoRedemption,
    Referral,
    ReferralCode,
    ReferralStatus,
    Subscription,
    SubscriptionStatus,
)
from app.models.user import User
from app.schemas.payments import (
    BillingOverview,
    CheckoutRequest,
    CheckoutResponse,
    PaymentPublic,
    SubscriptionPublic,
    YooKassaNotification,
)
from app.services.plans import sync_plan_catalog
from app.services.yookassa import YooKassaClient


def _add_term(value: datetime, interval: BillingInterval, bonus_days: int = 0) -> datetime:
    months = 1 if interval is BillingInterval.month else 12
    year = value.year + (value.month - 1 + months) // 12
    month = (value.month - 1 + months) % 12 + 1
    day = min(value.day, calendar.monthrange(year, month)[1])
    return value.replace(year=year, month=month, day=day) + timedelta(days=bonus_days)


class BillingService:
    def __init__(self, db: AsyncSession, provider: YooKassaClient | None = None) -> None:
        self.db = db
        self.provider = provider or YooKassaClient()

    async def _plan(self, code: str) -> Plan:
        await sync_plan_catalog(self.db)
        plan = await self.db.scalar(
            select(Plan)
            .where(Plan.code == code, Plan.active.is_(True))
            .order_by(Plan.version.desc())
        )
        if plan is None:
            raise NotFoundError("Тариф не найден")
        return plan

    async def _promo(self, user: User, raw_code: str | None) -> PromoCode | None:
        if not raw_code:
            return None
        now = datetime.now(UTC)
        promo = await self.db.scalar(
            select(PromoCode).where(PromoCode.code == raw_code.strip().upper())
        )
        if (
            promo is None
            or not promo.active
            or promo.starts_at > now
            or (promo.ends_at is not None and promo.ends_at <= now)
        ):
            raise ValidationError("Промокод недействителен")
        used = await self.db.scalar(
            select(PromoRedemption.id).where(
                PromoRedemption.promo_code_id == promo.id,
                PromoRedemption.user_id == user.id,
            )
        )
        count = await self.db.scalar(
            select(func.count(PromoRedemption.id)).where(PromoRedemption.promo_code_id == promo.id)
        )
        exhausted = promo.max_redemptions is not None and int(count or 0) >= promo.max_redemptions
        if used is not None or exhausted:
            raise ConflictError("Промокод уже использован")
        return promo

    async def checkout(self, user: User, body: CheckoutRequest) -> CheckoutResponse:
        key = str(body.request_key)
        previous = await self.db.scalar(
            select(Payment).where(Payment.idempotency_key == key, Payment.user_id == user.id)
        )
        if previous is not None:
            previous_plan = await self.db.get(Plan, previous.plan_id)
            if (
                previous_plan is None
                or previous_plan.code != body.plan_code
                or previous.interval.value != body.interval
            ):
                raise ConflictError("Ключ запроса уже использован для другого платежа")
            if previous.confirmation_url is None:
                raise ConflictError("Платёж ещё создаётся")
            return CheckoutResponse(
                payment_id=previous.id,
                confirmation_url=previous.confirmation_url,
                amount=previous.amount,
                currency=previous.currency,
            )

        plan = await self._plan(body.plan_code)
        interval = BillingInterval(body.interval)
        base_amount = plan.price_month if interval is BillingInterval.month else plan.price_year
        if base_amount is None:
            raise ValidationError("Для тарифа нет выбранного периода")
        promo = await self._promo(user, body.promo_code)
        discount = 0
        bonus_days = 0
        if promo is not None:
            if promo.kind is PromoKind.percent:
                discount = base_amount * min(promo.value, 99) // 100
            else:
                bonus_days = promo.value
        amount = base_amount - discount
        payment = Payment(
            user_id=user.id,
            plan_id=plan.id,
            interval=interval,
            amount=amount,
            discount_amount=discount,
            idempotency_key=key,
            promo_code_id=promo.id if promo else None,
            bonus_days=bonus_days,
        )
        self.db.add(payment)
        await self.db.flush()

        settings = get_settings()
        payload: dict[str, Any] = {
            "amount": {"value": f"{Decimal(amount) / 100:.2f}", "currency": "RUB"},
            "capture": True,
            "confirmation": {
                "type": "redirect",
                "return_url": f"{settings.app_url.rstrip('/')}/billing?payment=return",
            },
            "description": f"Запоминальня {plan.name}, {body.interval}",
            "metadata": {
                "payment_id": str(payment.id),
                "user_id": str(user.id),
                "plan": plan.code,
                "interval": body.interval,
            },
        }
        if settings.yookassa_send_receipt and user.email:
            payload["receipt"] = {
                "customer": {"email": user.email},
                "items": [
                    {
                        "description": f"Подписка «Запоминальня» {plan.name}",
                        "quantity": "1.00",
                        "amount": payload["amount"],
                        "vat_code": settings.yookassa_vat_code,
                        "payment_mode": "full_payment",
                        "payment_subject": "service",
                    }
                ],
            }
        remote = await self.provider.create_payment(payload, key)
        confirmation_url = str(remote.get("confirmation", {}).get("confirmation_url", ""))
        provider_id = str(remote.get("id", ""))
        if not confirmation_url or not provider_id:
            raise ValidationError("ЮKassa вернула неполный ответ")
        payment.provider_payment_id = provider_id
        payment.confirmation_url = confirmation_url
        payment.provider_payload = remote
        return CheckoutResponse(
            payment_id=payment.id,
            confirmation_url=confirmation_url,
            amount=amount,
            currency="RUB",
        )

    async def _current_subscription(self, user_id: Any) -> tuple[Subscription, Plan] | None:
        now = datetime.now(UTC)
        row = (
            await self.db.execute(
                select(Subscription, Plan)
                .join(Plan, Plan.id == Subscription.plan_id)
                .where(
                    Subscription.user_id == user_id,
                    Subscription.current_period_start <= now,
                    Subscription.current_period_end > now,
                    Subscription.status.in_(
                        [SubscriptionStatus.active, SubscriptionStatus.canceled]
                    ),
                )
                .order_by(Subscription.current_period_end.desc())
                .limit(1)
            )
        ).first()
        return (row[0], row[1]) if row is not None else None

    async def _activate(self, payment: Payment, paid_at: datetime) -> None:
        current = await self._current_subscription(payment.user_id)
        if current is not None and current[1].id == payment.plan_id:
            subscription = current[0]
            subscription.current_period_end = _add_term(
                subscription.current_period_end, payment.interval, payment.bonus_days
            )
            subscription.status = SubscriptionStatus.active
            subscription.cancel_at_period_end = True
        else:
            if current is not None:
                current[0].current_period_end = paid_at
                current[0].ended_at = paid_at
                current[0].status = SubscriptionStatus.expired
            subscription = Subscription(
                user_id=payment.user_id,
                plan_id=payment.plan_id,
                status=SubscriptionStatus.active,
                interval=payment.interval,
                current_period_start=paid_at,
                current_period_end=_add_term(paid_at, payment.interval, payment.bonus_days),
                cancel_at_period_end=True,
            )
            self.db.add(subscription)
        if payment.promo_code_id is not None:
            self.db.add(
                PromoRedemption(promo_code_id=payment.promo_code_id, user_id=payment.user_id)
            )
        await self._reward_referral(payment.user_id, subscription.current_period_end)

    async def _reward_referral(self, invited_user_id: Any, starts_at: datetime) -> None:
        referral = await self.db.scalar(
            select(Referral).where(
                Referral.invited_user_id == invited_user_id,
                Referral.status == ReferralStatus.registered,
            )
        )
        if referral is None:
            return
        plus = await self._plan("plus")
        self.db.add(
            Subscription(
                user_id=invited_user_id,
                plan_id=plus.id,
                status=SubscriptionStatus.active,
                interval=BillingInterval.month,
                current_period_start=starts_at,
                current_period_end=starts_at + timedelta(days=referral.reward_days),
            )
        )
        inviter_current = await self._current_subscription(referral.inviter_id)
        inviter_start = (
            inviter_current[0].current_period_end if inviter_current else datetime.now(UTC)
        )
        self.db.add(
            Subscription(
                user_id=referral.inviter_id,
                plan_id=plus.id,
                status=SubscriptionStatus.active,
                interval=BillingInterval.month,
                current_period_start=inviter_start,
                current_period_end=inviter_start + timedelta(days=referral.reward_days),
            )
        )
        referral.status = ReferralStatus.rewarded
        referral.rewarded_at = datetime.now(UTC)

    async def webhook(self, notification: YooKassaNotification) -> None:
        provider_id = str(notification.object.get("id", ""))
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", provider_id):
            raise ValidationError("В уведомлении нет платежа")
        remote = await self.provider.get_payment(provider_id)
        event = notification.event
        expected_status = event.removeprefix("payment.")
        if remote.get("status") != expected_status:
            raise ValidationError("Статус платежа не подтверждён")
        payment = await self.db.scalar(
            select(Payment).where(Payment.provider_payment_id == provider_id)
        )
        if payment is None:
            raise NotFoundError("Платёж не найден")
        metadata = remote.get("metadata", {})
        amount = remote.get("amount", {})
        if (
            metadata.get("payment_id") != str(payment.id)
            or amount.get("currency") != payment.currency
            or amount.get("value") != f"{Decimal(payment.amount) / 100:.2f}"
        ):
            raise ValidationError("Параметры платежа не совпадают")
        fingerprint = hashlib.sha256(f"{event}:{provider_id}".encode()).hexdigest()
        event_id = uuid4()
        inserted = await self.db.scalar(
            insert(PaymentEvent)
            .values(
                id=event_id,
                fingerprint=fingerprint,
                event=event,
                provider_payment_id=provider_id,
                payment_id=payment.id,
                payload=notification.model_dump(mode="json"),
            )
            .on_conflict_do_nothing(index_elements=[PaymentEvent.fingerprint])
            .returning(PaymentEvent.id)
        )
        if inserted is None:
            return
        if event == "payment.succeeded" and payment.status is not PaymentStatus.succeeded:
            paid_at = datetime.fromisoformat(str(remote["captured_at"]).replace("Z", "+00:00"))
            payment.status = PaymentStatus.succeeded
            payment.paid_at = paid_at
            payment.provider_payload = remote
            await self._activate(payment, paid_at)
        elif event == "payment.canceled":
            payment.status = PaymentStatus.canceled
            payment.provider_payload = remote
        await self.db.execute(
            update(PaymentEvent)
            .where(PaymentEvent.id == event_id)
            .values(processed_at=datetime.now(UTC))
        )

    async def overview(self, user: User) -> BillingOverview:
        current = await self._current_subscription(user.id)
        payments = (
            await self.db.scalars(
                select(Payment)
                .where(Payment.user_id == user.id)
                .order_by(Payment.created_at.desc())
            )
        ).all()
        plans = {plan.id: plan for plan in (await self.db.scalars(select(Plan))).all()}
        code = await self.referral_code(user)
        return BillingOverview(
            subscription=(
                SubscriptionPublic(
                    plan_code=current[1].code,
                    plan_name=current[1].name,
                    status=current[0].status.value,
                    interval=current[0].interval.value,
                    current_period_start=current[0].current_period_start,
                    current_period_end=current[0].current_period_end,
                    cancel_at_period_end=current[0].cancel_at_period_end,
                )
                if current
                else None
            ),
            payments=[
                PaymentPublic(
                    id=item.id,
                    plan_code=plans[item.plan_id].code,
                    plan_name=plans[item.plan_id].name,
                    interval=item.interval.value,
                    status=item.status.value,
                    amount=item.amount,
                    discount_amount=item.discount_amount,
                    currency=item.currency,
                    receipt_url=item.receipt_url,
                    created_at=item.created_at,
                    paid_at=item.paid_at,
                )
                for item in payments
            ],
            referral_code=code,
        )

    async def cancel(self, user: User) -> SubscriptionPublic:
        current = await self._current_subscription(user.id)
        if current is None:
            raise NotFoundError("Активная подписка не найдена")
        subscription, plan = current
        subscription.cancel_at_period_end = True
        subscription.status = SubscriptionStatus.canceled
        return SubscriptionPublic(
            plan_code=plan.code,
            plan_name=plan.name,
            status=subscription.status.value,
            interval=subscription.interval.value,
            current_period_start=subscription.current_period_start,
            current_period_end=subscription.current_period_end,
            cancel_at_period_end=True,
        )

    async def referral_code(self, user: User) -> str:
        existing = await self.db.scalar(select(ReferralCode).where(ReferralCode.user_id == user.id))
        if existing is not None:
            return existing.code
        alphabet = string.ascii_uppercase + string.digits
        for _ in range(5):
            code = "RMR-" + "".join(secrets.choice(alphabet) for _ in range(8))
            duplicate = await self.db.scalar(
                select(ReferralCode.id).where(ReferralCode.code == code)
            )
            if duplicate is None:
                self.db.add(ReferralCode(user_id=user.id, code=code))
                await self.db.flush()
                return code
        raise ConflictError("Не удалось создать пригласительный код")

    async def attach_referral(self, user: User, code: str | None) -> None:
        if not code:
            return
        referral_code = await self.db.scalar(
            select(ReferralCode).where(ReferralCode.code == code.strip().upper())
        )
        if referral_code is None or referral_code.user_id == user.id:
            raise ValidationError("Пригласительный код недействителен")
        self.db.add(
            Referral(
                code_id=referral_code.id,
                inviter_id=referral_code.user_id,
                invited_user_id=user.id,
            )
        )
