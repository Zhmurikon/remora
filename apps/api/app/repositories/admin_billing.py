"""Запросы административного раздела платежей без бизнес-решений."""

from contextlib import suppress
from dataclasses import dataclass
from typing import cast
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from app.models.billing import Payment, PaymentEvent, Plan, Subscription
from app.models.user import User


@dataclass(frozen=True)
class PaymentRecord:
    payment: Payment
    user: User
    plan: Plan


@dataclass(frozen=True)
class SubscriptionRecord:
    subscription: Subscription
    plan: Plan


def _search_filter(query: str) -> ColumnElement[bool]:
    escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    conditions: list[ColumnElement[bool]] = [
        User.username.ilike(f"%{escaped}%", escape="\\"),
        User.email.ilike(f"%{escaped}%", escape="\\"),
        Payment.provider_payment_id.ilike(f"%{escaped}%", escape="\\"),
    ]
    with suppress(ValueError):
        payment_id = UUID(query)
        conditions.extend([Payment.id == payment_id, Payment.user_id == payment_id])
    return or_(*conditions)


async def payments(
    db: AsyncSession,
    *,
    query: str | None,
    status: str | None,
    offset: int,
    limit: int,
) -> tuple[list[PaymentRecord], int]:
    filters = []
    if query:
        filters.append(_search_filter(query))
    if status:
        filters.append(Payment.status == status)
    base = (
        select(Payment, User, Plan)
        .join(User, User.id == Payment.user_id)
        .join(Plan, Plan.id == Payment.plan_id)
        .where(*filters)
    )
    total = int((await db.scalar(select(func.count()).select_from(base.subquery()))) or 0)
    rows = await db.execute(
        base.order_by(Payment.created_at.desc(), Payment.id.desc()).offset(offset).limit(limit)
    )
    return [PaymentRecord(row[0], row[1], row[2]) for row in rows.all()], total


async def payment(
    db: AsyncSession, payment_id: UUID, *, lock: bool = False
) -> PaymentRecord | None:
    statement = (
        select(Payment, User, Plan)
        .join(User, User.id == Payment.user_id)
        .join(Plan, Plan.id == Payment.plan_id)
        .where(Payment.id == payment_id)
    )
    if lock:
        statement = statement.with_for_update()
    row = (await db.execute(statement)).first()
    return PaymentRecord(row[0], row[1], row[2]) if row else None


async def payment_events(db: AsyncSession, payment_id: UUID) -> list[PaymentEvent]:
    return list(
        await db.scalars(
            select(PaymentEvent)
            .where(PaymentEvent.payment_id == payment_id)
            .order_by(PaymentEvent.received_at.desc(), PaymentEvent.id.desc())
        )
    )


async def event_for_update(db: AsyncSession, event_id: UUID) -> PaymentEvent | None:
    return cast(
        PaymentEvent | None,
        await db.scalar(select(PaymentEvent).where(PaymentEvent.id == event_id).with_for_update()),
    )


async def subscriptions(db: AsyncSession, user_id: UUID) -> list[SubscriptionRecord]:
    rows = await db.execute(
        select(Subscription, Plan)
        .join(Plan, Plan.id == Subscription.plan_id)
        .where(Subscription.user_id == user_id)
        .order_by(Subscription.current_period_end.desc(), Subscription.id.desc())
    )
    return [SubscriptionRecord(row[0], row[1]) for row in rows.all()]


async def subscription_for_update(
    db: AsyncSession, subscription_id: UUID
) -> SubscriptionRecord | None:
    row = (
        await db.execute(
            select(Subscription, Plan)
            .join(Plan, Plan.id == Subscription.plan_id)
            .where(Subscription.id == subscription_id)
            .with_for_update()
        )
    ).first()
    return SubscriptionRecord(row[0], row[1]) if row else None
