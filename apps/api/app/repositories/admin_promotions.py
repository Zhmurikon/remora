"""Запросы раздела промокодов и рефералов без бизнес-решений."""

from contextlib import suppress
from dataclasses import dataclass
from datetime import timedelta
from typing import cast
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased
from sqlalchemy.sql.elements import ColumnElement

from app.models.billing import PromoCode, PromoRedemption, Referral, ReferralCode, Subscription
from app.models.user import User


@dataclass(frozen=True)
class PromoRecord:
    promo: PromoCode
    redemptions: int


@dataclass(frozen=True)
class ReferralRecord:
    referral: Referral
    code: str
    inviter: User
    invited: User
    chain_size: int


def _escaped(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


async def promo_codes(
    db: AsyncSession, *, query: str | None, state: str | None, offset: int, limit: int
) -> tuple[list[PromoRecord], int]:
    redemption_count = (
        select(func.count(PromoRedemption.id))
        .where(PromoRedemption.promo_code_id == PromoCode.id)
        .correlate(PromoCode)
        .scalar_subquery()
    )
    filters: list[ColumnElement[bool]] = []
    now = func.now()
    if query:
        filters.append(PromoCode.code.ilike(f"%{_escaped(query)}%", escape="\\"))
    if state == "scheduled":
        filters.extend(
            [
                PromoCode.active.is_(True),
                PromoCode.starts_at > now,
                or_(
                    PromoCode.max_redemptions.is_(None),
                    redemption_count < PromoCode.max_redemptions,
                ),
            ]
        )
    elif state == "active":
        filters.extend(
            [
                PromoCode.active.is_(True),
                PromoCode.starts_at <= now,
                or_(PromoCode.ends_at.is_(None), PromoCode.ends_at > now),
                or_(
                    PromoCode.max_redemptions.is_(None),
                    redemption_count < PromoCode.max_redemptions,
                ),
            ]
        )
    elif state == "expired":
        filters.extend(
            [
                PromoCode.active.is_(True),
                PromoCode.ends_at <= now,
                or_(
                    PromoCode.max_redemptions.is_(None),
                    redemption_count < PromoCode.max_redemptions,
                ),
            ]
        )
    elif state == "disabled":
        filters.append(PromoCode.active.is_(False))
    elif state == "exhausted":
        filters.extend(
            [
                PromoCode.active.is_(True),
                PromoCode.max_redemptions.is_not(None),
                redemption_count >= PromoCode.max_redemptions,
            ]
        )
    base = select(PromoCode, redemption_count.label("redemptions")).where(*filters)
    total = int((await db.scalar(select(func.count()).select_from(base.subquery()))) or 0)
    rows = await db.execute(
        base.order_by(PromoCode.created_at.desc(), PromoCode.id.desc()).offset(offset).limit(limit)
    )
    return [PromoRecord(row[0], int(row[1])) for row in rows.all()], total


async def promo_for_update(db: AsyncSession, promo_id: UUID) -> PromoCode | None:
    return cast(
        PromoCode | None,
        await db.scalar(select(PromoCode).where(PromoCode.id == promo_id).with_for_update()),
    )


async def promo_by_code(db: AsyncSession, code: str) -> PromoCode | None:
    return cast(PromoCode | None, await db.scalar(select(PromoCode).where(PromoCode.code == code)))


async def referral_records(
    db: AsyncSession,
    *,
    query: str | None,
    status: str | None,
    suspicious: bool | None,
    offset: int,
    limit: int,
) -> tuple[list[ReferralRecord], int]:
    inviter = aliased(User, name="inviter")
    invited = aliased(User, name="invited")
    chain_size = (
        select(func.count(Referral.id))
        .where(Referral.inviter_id == inviter.id)
        .correlate(inviter)
        .scalar_subquery()
    )
    filters: list[ColumnElement[bool]] = []
    if query:
        value = f"%{_escaped(query)}%"
        conditions: list[ColumnElement[bool]] = [
            ReferralCode.code.ilike(value, escape="\\"),
            inviter.username.ilike(value, escape="\\"),
            inviter.email.ilike(value, escape="\\"),
            invited.username.ilike(value, escape="\\"),
            invited.email.ilike(value, escape="\\"),
        ]
        with suppress(ValueError):
            identifier = UUID(query)
            conditions.extend(
                [Referral.id == identifier, inviter.id == identifier, invited.id == identifier]
            )
        filters.append(or_(*conditions))
    if status:
        filters.append(Referral.status == status)
    if suspicious is not None:
        quick_reward = func.coalesce(
            Referral.rewarded_at - Referral.created_at <= timedelta(minutes=10), False
        )
        risky = or_(
            chain_size >= 5,
            quick_reward,
        )
        filters.append(risky if suspicious else ~risky)
    base = (
        select(Referral, ReferralCode.code, inviter, invited, chain_size.label("chain_size"))
        .join(ReferralCode, ReferralCode.id == Referral.code_id)
        .join(inviter, inviter.id == Referral.inviter_id)
        .join(invited, invited.id == Referral.invited_user_id)
        .where(*filters)
    )
    total = int((await db.scalar(select(func.count()).select_from(base.subquery()))) or 0)
    rows = await db.execute(
        base.order_by(Referral.created_at.desc(), Referral.id.desc()).offset(offset).limit(limit)
    )
    return [ReferralRecord(row[0], row[1], row[2], row[3], int(row[4])) for row in rows], total


async def referral_for_update(db: AsyncSession, referral_id: UUID) -> Referral | None:
    return cast(
        Referral | None,
        await db.scalar(select(Referral).where(Referral.id == referral_id).with_for_update()),
    )


async def subscription_for_update(db: AsyncSession, subscription_id: UUID) -> Subscription | None:
    return cast(
        Subscription | None,
        await db.scalar(
            select(Subscription).where(Subscription.id == subscription_id).with_for_update()
        ),
    )
