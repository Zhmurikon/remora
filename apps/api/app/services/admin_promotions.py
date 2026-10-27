"""Управление промокодами и аудируемая компенсация реферальных начислений."""

import hashlib
import json
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, NotFoundError
from app.models.billing import PromoCode, PromoKind, ReferralStatus, SubscriptionStatus
from app.models.user import User
from app.repositories import admin_promotions as repo
from app.repositories import admin_security as security_repo
from app.schemas.admin_promotions import (
    AdminPromoCodeCreate,
    AdminPromoCodeItem,
    AdminPromoCodeList,
    AdminReferralItem,
    AdminReferralList,
)


class AdminPromotionsService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def promo_codes(
        self, *, query: str | None, state: str | None, offset: int, limit: int
    ) -> AdminPromoCodeList:
        records, total = await repo.promo_codes(
            self.db, query=query, state=state, offset=offset, limit=limit
        )
        return AdminPromoCodeList(
            items=[self._promo(item.promo, item.redemptions) for item in records],
            total=total,
            offset=offset,
            limit=limit,
        )

    async def create_promo(
        self,
        *,
        actor: User,
        body: AdminPromoCodeCreate,
        idempotency_key: str,
        ip: str | None,
        user_agent: str | None,
    ) -> AdminPromoCodeItem:
        code = body.code.strip().upper()
        payload = body.model_dump(mode="json", exclude={"reason"}) | {"code": code}
        existing = await security_repo.get_audit_by_idempotency(self.db, idempotency_key)
        request_hash = self._request_hash("admin.promotions.promo_created", None, payload)
        if existing is not None:
            if (
                existing.actor_user_id != actor.id
                or existing.action != "admin.promotions.promo_created"
                or existing.details.get("request_hash") != request_hash
                or existing.target_id is None
            ):
                raise ConflictError("Ключ идемпотентности уже использован для другого действия")
            promo = await repo.promo_for_update(self.db, existing.target_id)
            if promo is None:
                raise NotFoundError("Промокод не найден")
            records, _ = await repo.promo_codes(
                self.db, query=promo.code, state=None, offset=0, limit=1
            )
            return self._promo(promo, records[0].redemptions if records else 0)
        if await repo.promo_by_code(self.db, code) is not None:
            raise ConflictError("Промокод с таким кодом уже существует")
        promo = PromoCode(
            code=code,
            kind=PromoKind(body.kind),
            value=body.value,
            max_redemptions=body.max_redemptions,
            starts_at=body.starts_at,
            ends_at=body.ends_at,
        )
        self.db.add(promo)
        await self.db.flush()
        await self._audit(
            actor=actor,
            action="admin.promotions.promo_created",
            target_type="promo_code",
            target_id=promo.id,
            reason=body.reason,
            idempotency_key=idempotency_key,
            ip=ip,
            user_agent=user_agent,
            payload=payload,
            details={"code": code, "kind": body.kind, "value": body.value},
            hash_target=False,
        )
        return self._promo(promo, 0)

    async def disable_promo(
        self,
        *,
        actor: User,
        promo_id: UUID,
        reason: str,
        idempotency_key: str,
        ip: str | None,
        user_agent: str | None,
    ) -> AdminPromoCodeItem:
        promo = await repo.promo_for_update(self.db, promo_id)
        if promo is None:
            raise NotFoundError("Промокод не найден")
        payload = {"reason": reason}
        if not await self._repeated(
            actor,
            "admin.promotions.promo_disabled",
            "promo_code",
            promo_id,
            payload,
            idempotency_key,
        ):
            if not promo.active:
                raise ConflictError("Промокод уже отключён")
            promo.active = False
            await self._audit(
                actor=actor,
                action="admin.promotions.promo_disabled",
                target_type="promo_code",
                target_id=promo_id,
                reason=reason,
                idempotency_key=idempotency_key,
                ip=ip,
                user_agent=user_agent,
                payload=payload,
                details={"code": promo.code},
            )
        records, _ = await repo.promo_codes(
            self.db, query=promo.code, state=None, offset=0, limit=1
        )
        return self._promo(promo, records[0].redemptions if records else 0)

    async def referrals(
        self,
        *,
        query: str | None,
        status: str | None,
        suspicious: bool | None,
        offset: int,
        limit: int,
    ) -> AdminReferralList:
        records, total = await repo.referral_records(
            self.db,
            query=query,
            status=status,
            suspicious=suspicious,
            offset=offset,
            limit=limit,
        )
        return AdminReferralList(
            items=[self._referral(item) for item in records],
            total=total,
            offset=offset,
            limit=limit,
        )

    async def revoke_referral_reward(
        self,
        *,
        actor: User,
        referral_id: UUID,
        reason: str,
        idempotency_key: str,
        ip: str | None,
        user_agent: str | None,
    ) -> AdminReferralItem:
        referral = await repo.referral_for_update(self.db, referral_id)
        if referral is None:
            raise NotFoundError("Реферальное начисление не найдено")
        payload = {"reason": reason}
        repeated = await self._repeated(
            actor,
            "admin.promotions.referral_reward_revoked",
            "referral",
            referral_id,
            payload,
            idempotency_key,
        )
        if not repeated:
            if referral.status is not ReferralStatus.rewarded:
                raise ConflictError("Компенсация доступна только для начисленного бонуса")
            if referral.invited_subscription_id is None or referral.inviter_subscription_id is None:
                raise ConflictError("У начисления нет безопасной связи с бонусными подписками")
            invited = await repo.subscription_for_update(self.db, referral.invited_subscription_id)
            inviter = await repo.subscription_for_update(self.db, referral.inviter_subscription_id)
            if invited is None or inviter is None:
                raise ConflictError("Одна из бонусных подписок не найдена")
            now = datetime.now(UTC)
            for subscription in (invited, inviter):
                subscription.status = SubscriptionStatus.expired
                subscription.cancel_at_period_end = True
                subscription.current_period_end = max(
                    subscription.current_period_start,
                    min(subscription.current_period_end, now),
                )
                subscription.ended_at = now
            referral.status = ReferralStatus.rejected
            referral.revoked_at = now
            await self._audit(
                actor=actor,
                action="admin.promotions.referral_reward_revoked",
                target_type="referral",
                target_id=referral_id,
                reason=reason,
                idempotency_key=idempotency_key,
                ip=ip,
                user_agent=user_agent,
                payload=payload,
                details={
                    "invited_subscription_id": str(invited.id),
                    "inviter_subscription_id": str(inviter.id),
                },
            )
        records, _ = await repo.referral_records(
            self.db, query=str(referral_id), status=None, suspicious=None, offset=0, limit=1
        )
        if not records:
            raise NotFoundError("Реферальное начисление не найдено")
        return self._referral(records[0])

    @staticmethod
    def _promo(promo: PromoCode, redemptions: int) -> AdminPromoCodeItem:
        now = datetime.now(UTC)
        if not promo.active:
            state = "disabled"
        elif promo.max_redemptions is not None and redemptions >= promo.max_redemptions:
            state = "exhausted"
        elif promo.starts_at > now:
            state = "scheduled"
        elif promo.ends_at is not None and promo.ends_at <= now:
            state = "expired"
        else:
            state = "active"
        return AdminPromoCodeItem(
            id=promo.id,
            code=promo.code,
            kind=promo.kind.value,
            value=promo.value,
            max_redemptions=promo.max_redemptions,
            redemptions=redemptions,
            starts_at=promo.starts_at,
            ends_at=promo.ends_at,
            active=promo.active,
            state=state,
            created_at=promo.created_at,
        )

    @staticmethod
    def _referral(record: repo.ReferralRecord) -> AdminReferralItem:
        referral = record.referral
        signals = []
        if record.chain_size >= 5:
            signals.append("Пять или больше регистраций в цепочке")
        if (
            referral.rewarded_at is not None
            and referral.rewarded_at - referral.created_at <= timedelta(minutes=10)
        ):
            signals.append("Бонус начислен менее чем через 10 минут после регистрации")
        return AdminReferralItem(
            id=referral.id,
            code=record.code,
            inviter_id=record.inviter.id,
            inviter_username=record.inviter.username,
            inviter_email=record.inviter.email,
            invited_user_id=record.invited.id,
            invited_username=record.invited.username,
            invited_email=record.invited.email,
            status=referral.status.value,
            reward_days=referral.reward_days,
            rewarded_at=referral.rewarded_at,
            revoked_at=referral.revoked_at,
            invited_subscription_id=referral.invited_subscription_id,
            inviter_subscription_id=referral.inviter_subscription_id,
            risk_signals=signals,
            created_at=referral.created_at,
        )

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
        hash_target: bool = True,
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
                "request_hash": self._request_hash(
                    action, target_id if hash_target else None, payload
                ),
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
        if (
            existing.actor_user_id != actor.id
            or existing.action != action
            or existing.target_type != target_type
            or existing.target_id != target_id
            or existing.details.get("request_hash")
            != self._request_hash(action, target_id, payload)
        ):
            raise ConflictError("Ключ идемпотентности уже использован для другого действия")
        return True

    @staticmethod
    def _request_hash(action: str, target_id: UUID | None, payload: dict[str, Any]) -> str:
        value = json.dumps(
            {
                "action": action,
                "target_id": str(target_id) if target_id else None,
                "payload": payload,
            },
            sort_keys=True,
            ensure_ascii=False,
            default=str,
            separators=(",", ":"),
        )
        return hashlib.sha256(value.encode()).hexdigest()
