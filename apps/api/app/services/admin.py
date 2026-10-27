"""Просмотр и защищённое управление пользователями из административной панели."""

import hashlib
import json
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.models.billing import Entitlement, EntitlementSource
from app.models.user import User, UserRole, UserStatus
from app.repositories import admin as repo
from app.repositories import admin_security as security_repo
from app.repositories import token as token_repo
from app.schemas.admin import (
    AdminEntitlementDecision,
    AdminOverview,
    AdminPlanCatalog,
    AdminPlanItem,
    AdminUserAccess,
    AdminUserActivity,
    AdminUserDegradationLimit,
    AdminUserDegradationPreview,
    AdminUserDetail,
    AdminUserEntitlementHistoryItem,
    AdminUserEntitlementOverride,
    AdminUserItem,
    AdminUserList,
    AdminUserMaterialItem,
    AdminUserMaterials,
    AdminUserPayment,
    AdminUserPromoRedemption,
    AdminUserReferral,
)
from app.services.entitlements import Entitlements, ResolvedEntitlements, load_plan_catalog

DEGRADATION_GUARANTEES = [
    "Материалы не удаляются и остаются доступны",
    "Обучение и повторения не ограничиваются",
    "Создание сверх новых лимитов блокируется без скрытия существующего",
]


class AdminService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def overview(self) -> AdminOverview:
        generated_at = datetime.now(UTC)
        record = await repo.overview(self.db, now=generated_at)
        return AdminOverview(generated_at=generated_at, **record.__dict__)

    async def users(self, *, query: str | None, offset: int, limit: int) -> AdminUserList:
        records, total = await repo.users(
            self.db,
            query=query,
            offset=offset,
            limit=limit,
        )
        return AdminUserList(
            items=[
                AdminUserItem(
                    id=record.user.id,
                    email=record.user.email,
                    username=record.user.username,
                    display_name=record.user.display_name,
                    role=record.user.role.value,
                    status=record.user.status.value,
                    email_verified=record.user.email_verified_at is not None,
                    created_at=record.user.created_at,
                    last_active_at=record.last_active_at,
                    sets_count=record.sets_count,
                    courses_count=record.courses_count,
                    reviews_count=record.reviews_count,
                )
                for record in records
            ],
            total=total,
            offset=offset,
            limit=limit,
        )

    async def plans(self) -> AdminPlanCatalog:
        catalog = load_plan_catalog()
        catalog_plans = catalog["plans"]
        rows = await repo.active_plans(self.db)
        return AdminPlanCatalog(
            catalog_version=int(catalog["version"]),
            source="app/config/plans.yaml",
            items=[
                AdminPlanItem(
                    id=plan.id,
                    code=plan.code,
                    version=plan.version,
                    name=plan.name,
                    price_month=plan.price_month,
                    price_year=plan.price_year,
                    effective_from=plan.effective_from,
                    features=dict(plan.features.get("features", {})),
                    limits=dict(plan.features.get("limits", {})),
                    active_subscriptions=subscriptions_count,
                    matches_catalog=(
                        plan.version == int(catalog["version"])
                        and catalog_plans.get(plan.code) == plan.features
                    ),
                )
                for plan, subscriptions_count in rows
            ],
        )

    async def user(self, user_id: UUID) -> AdminUserDetail:
        now = datetime.now(UTC)
        record = await repo.user_detail(self.db, user_id, now=now)
        if record is None:
            raise NotFoundError("Пользователь не найден")

        entitlements = Entitlements(self.db)
        resolved = await entitlements.resolve(record.user, now=now)
        usage = await entitlements.creation_quota_usage(record.user)
        usage.update(record.counter_usage)
        remaining = entitlements.quota_remaining(resolved.limits, usage)
        degradation = self._degradation_preview(
            resolved_features=resolved.features,
            usage=usage,
            overrides=record.overrides,
        )
        return AdminUserDetail(
            id=record.user.id,
            email=record.user.email,
            username=record.user.username,
            display_name=record.user.display_name,
            role=record.user.role.value,
            status=record.user.status.value,
            email_verified=record.user.email_verified_at is not None,
            created_at=record.user.created_at,
            updated_at=record.user.updated_at,
            deleted_at=record.user.deleted_at,
            locale=record.user.locale,
            timezone=record.user.timezone,
            oauth_providers=record.oauth_providers,
            materials=AdminUserMaterials(
                sets_total=record.materials.sets_total,
                sets_archived=record.materials.sets_archived,
                cards_total=record.materials.cards_total,
                courses_total=record.materials.courses_total,
                courses_published=record.materials.courses_published,
                recent=[AdminUserMaterialItem(**item.__dict__) for item in record.materials.recent],
            ),
            activity=AdminUserActivity(**record.activity.__dict__),
            access=AdminUserAccess(
                plan_code=resolved.plan_code,
                plan_name=resolved.plan_name,
                plan_version=resolved.plan_version,
                current_period_end=resolved.current_period_end,
                cancel_at_period_end=resolved.cancel_at_period_end,
                features=resolved.features,
                limits=resolved.limits,
                usage=usage,
                remaining=remaining,
                overrides=[
                    AdminUserEntitlementOverride(
                        id=item.id,
                        key=item.key,
                        value=item.value,
                        source=item.source.value,
                        reason=item.reason,
                        starts_at=item.starts_at,
                        valid_until=item.valid_until,
                        revocable=item.source is EntitlementSource.admin,
                    )
                    for item in record.overrides
                ],
                history=[
                    AdminUserEntitlementHistoryItem(
                        id=item.id,
                        key=item.key,
                        value=item.value,
                        source=item.source.value,
                        reason=item.reason,
                        starts_at=item.starts_at,
                        valid_until=item.valid_until,
                        revocable=(
                            item.source is EntitlementSource.admin
                            and item.starts_at <= now
                            and (item.valid_until is None or item.valid_until > now)
                        ),
                        status=(
                            "scheduled"
                            if item.starts_at > now
                            else "active"
                            if item.valid_until is None or item.valid_until > now
                            else "expired"
                        ),
                        created_at=item.created_at,
                    )
                    for item in record.entitlement_history
                ],
                decisions=self._entitlement_decisions(resolved, record.overrides),
                degradation=degradation,
            ),
            payments=[
                AdminUserPayment(
                    id=item.payment.id,
                    plan_code=item.plan.code,
                    plan_name=item.plan.name,
                    interval=item.payment.interval.value,
                    status=item.payment.status.value,
                    amount=item.payment.amount,
                    discount_amount=item.payment.discount_amount,
                    currency=item.payment.currency,
                    promo_code=item.promo_code,
                    created_at=item.payment.created_at,
                    paid_at=item.payment.paid_at,
                )
                for item in record.payments
            ],
            promo_redemptions=[
                AdminUserPromoRedemption(
                    code=item.code.code,
                    kind=item.code.kind.value,
                    value=item.code.value,
                    redeemed_at=item.redeemed_at,
                )
                for item in record.promo_redemptions
            ],
            referral=AdminUserReferral(**record.referral.__dict__),
        )

    async def change_role(
        self,
        *,
        actor: User,
        user_id: UUID,
        role: UserRole,
        reason: str,
        idempotency_key: str,
        ip: str | None,
        user_agent: str | None,
    ) -> AdminUserDetail:
        target, repeated = await self._mutation_target(
            actor=actor,
            user_id=user_id,
            action="admin.user.role_changed",
            idempotency_key=idempotency_key,
            payload={"role": role.value, "reason": reason},
        )
        if repeated:
            return await self.user(user_id)
        if target.id == actor.id:
            raise ForbiddenError("Нельзя изменить собственную роль")
        if target.status is UserStatus.deleted:
            raise ConflictError("Удалённый аккаунт нельзя изменять")
        if target.role is role:
            raise ConflictError("У пользователя уже выбрана эта роль")
        if (
            target.role is UserRole.admin
            and target.status is UserStatus.active
            and await repo.lock_active_admins(self.db) <= 1
        ):
            raise ConflictError("Нельзя снять роль с последнего активного администратора")

        old_role = target.role
        target.role = role
        await token_repo.revoke_all_user_tokens(self.db, target.id)
        await security_repo.add_audit(
            self.db,
            actor_user_id=actor.id,
            action="admin.user.role_changed",
            outcome="success",
            target_type="user",
            target_id=target.id,
            reason=reason,
            idempotency_key=idempotency_key,
            ip=ip,
            user_agent=user_agent,
            details={
                "request_hash": self._request_hash(
                    "admin.user.role_changed",
                    target.id,
                    {"role": role.value, "reason": reason},
                ),
                "old_role": old_role.value,
                "new_role": role.value,
            },
        )
        await self.db.refresh(target)
        return await self.user(user_id)

    async def change_status(
        self,
        *,
        actor: User,
        user_id: UUID,
        status: UserStatus,
        reason: str,
        idempotency_key: str,
        ip: str | None,
        user_agent: str | None,
    ) -> AdminUserDetail:
        target, repeated = await self._mutation_target(
            actor=actor,
            user_id=user_id,
            action="admin.user.status_changed",
            idempotency_key=idempotency_key,
            payload={"status": status.value, "reason": reason},
        )
        if repeated:
            return await self.user(user_id)
        if target.id == actor.id:
            raise ForbiddenError("Нельзя изменить состояние собственного аккаунта")
        if target.status is UserStatus.deleted:
            raise ConflictError("Удалённый аккаунт нельзя восстановить этой операцией")
        if target.status is status:
            raise ConflictError("У пользователя уже выбрано это состояние")
        if (
            target.role is UserRole.admin
            and target.status is UserStatus.active
            and await repo.lock_active_admins(self.db) <= 1
        ):
            raise ConflictError("Нельзя приостановить последнего активного администратора")

        old_status = target.status
        target.status = status
        await token_repo.revoke_all_user_tokens(self.db, target.id)
        await security_repo.add_audit(
            self.db,
            actor_user_id=actor.id,
            action="admin.user.status_changed",
            outcome="success",
            target_type="user",
            target_id=target.id,
            reason=reason,
            idempotency_key=idempotency_key,
            ip=ip,
            user_agent=user_agent,
            details={
                "request_hash": self._request_hash(
                    "admin.user.status_changed",
                    target.id,
                    {"status": status.value, "reason": reason},
                ),
                "old_status": old_status.value,
                "new_status": status.value,
            },
        )
        await self.db.refresh(target)
        return await self.user(user_id)

    async def grant_entitlement(
        self,
        *,
        actor: User,
        user_id: UUID,
        key: str,
        value: bool | int | str,
        valid_until: datetime | None,
        reason: str,
        idempotency_key: str,
        ip: str | None,
        user_agent: str | None,
    ) -> AdminUserDetail:
        normalized_value = self._validate_entitlement(key, value)
        if valid_until is not None:
            if valid_until.tzinfo is None or valid_until.utcoffset() is None:
                raise ValidationError("Срок персонального права должен содержать часовой пояс")
            if valid_until <= datetime.now(UTC):
                raise ValidationError("Срок персонального права должен быть в будущем")
        payload = {
            "key": key,
            "value": normalized_value,
            "valid_until": valid_until,
            "reason": reason,
        }
        target, repeated = await self._mutation_target(
            actor=actor,
            user_id=user_id,
            action="admin.user.entitlement_granted",
            idempotency_key=idempotency_key,
            payload=payload,
        )
        if repeated:
            return await self.user(user_id)
        if target.status is UserStatus.deleted:
            raise ConflictError("Удалённому аккаунту нельзя выдать право")

        now = datetime.now(UTC)
        previous = await repo.active_admin_entitlements(self.db, user_id, key, now=now)
        for item in previous:
            item.valid_until = now
        entitlement = Entitlement(
            user_id=user_id,
            key=key,
            value=normalized_value,
            source=EntitlementSource.admin,
            reason=reason,
            starts_at=now,
            valid_until=valid_until,
        )
        self.db.add(entitlement)
        await self.db.flush()
        await security_repo.add_audit(
            self.db,
            actor_user_id=actor.id,
            action="admin.user.entitlement_granted",
            outcome="success",
            target_type="user",
            target_id=target.id,
            reason=reason,
            idempotency_key=idempotency_key,
            ip=ip,
            user_agent=user_agent,
            details={
                "request_hash": self._request_hash(
                    "admin.user.entitlement_granted", target.id, payload
                ),
                "entitlement_id": str(entitlement.id),
                "key": key,
                "value": normalized_value,
                "valid_until": valid_until.isoformat() if valid_until else None,
                "replaced_ids": [str(item.id) for item in previous],
            },
        )
        return await self.user(user_id)

    async def revoke_entitlement(
        self,
        *,
        actor: User,
        user_id: UUID,
        entitlement_id: UUID,
        reason: str,
        idempotency_key: str,
        ip: str | None,
        user_agent: str | None,
    ) -> AdminUserDetail:
        payload = {"entitlement_id": entitlement_id, "reason": reason}
        target, repeated = await self._mutation_target(
            actor=actor,
            user_id=user_id,
            action="admin.user.entitlement_revoked",
            idempotency_key=idempotency_key,
            payload=payload,
        )
        if repeated:
            return await self.user(user_id)
        entitlement = await repo.entitlement_for_update(self.db, user_id, entitlement_id)
        if entitlement is None:
            raise NotFoundError("Персональное право не найдено")
        if entitlement.source is not EntitlementSource.admin:
            raise ForbiddenError("Можно отзывать только права, выданные администратором")
        now = datetime.now(UTC)
        if entitlement.valid_until is not None and entitlement.valid_until <= now:
            raise ConflictError("Персональное право уже не действует")
        entitlement.valid_until = now
        await security_repo.add_audit(
            self.db,
            actor_user_id=actor.id,
            action="admin.user.entitlement_revoked",
            outcome="success",
            target_type="user",
            target_id=target.id,
            reason=reason,
            idempotency_key=idempotency_key,
            ip=ip,
            user_agent=user_agent,
            details={
                "request_hash": self._request_hash(
                    "admin.user.entitlement_revoked", target.id, payload
                ),
                "entitlement_id": str(entitlement.id),
                "key": entitlement.key,
                "value": entitlement.value,
            },
        )
        return await self.user(user_id)

    async def _mutation_target(
        self,
        *,
        actor: User,
        user_id: UUID,
        action: str,
        idempotency_key: str,
        payload: dict[str, Any],
    ) -> tuple[User, bool]:
        target = await repo.user_for_update(self.db, user_id)
        if target is None:
            raise NotFoundError("Пользователь не найден")
        existing = await security_repo.get_audit_by_idempotency(self.db, idempotency_key)
        if existing is None:
            return target, False
        expected_hash = self._request_hash(action, user_id, payload)
        if (
            existing.actor_user_id != actor.id
            or existing.action != action
            or existing.target_id != user_id
            or existing.details.get("request_hash") != expected_hash
        ):
            raise ConflictError("Ключ идемпотентности уже использован для другого действия")
        return target, True

    @staticmethod
    def _request_hash(action: str, user_id: UUID, payload: dict[str, Any]) -> str:
        serialized = json.dumps(
            {"action": action, "user_id": str(user_id), "payload": payload},
            sort_keys=True,
            ensure_ascii=False,
            default=str,
            separators=(",", ":"),
        )
        return hashlib.sha256(serialized.encode()).hexdigest()

    @staticmethod
    def _validate_entitlement(key: str, value: bool | int | str) -> bool | int | str:
        catalog = load_plan_catalog()["plans"]
        feature_keys = {
            f"feature.{name}" for plan in catalog.values() for name in plan.get("features", {})
        }
        limit_keys = {
            f"limit.{name}" for plan in catalog.values() for name in plan.get("limits", {})
        }
        if key in feature_keys and type(value) is bool:
            return value
        if key in limit_keys and ((type(value) is int and value >= 0) or value == "unlimited"):
            return value
        if key not in feature_keys | limit_keys:
            raise ValidationError("Неизвестное тарифное право")
        raise ValidationError("Значение не соответствует типу тарифного права")

    @staticmethod
    def _entitlement_decisions(
        resolved: ResolvedEntitlements, overrides: list[Entitlement]
    ) -> list[AdminEntitlementDecision]:
        # Репозиторий отдаёт историю от новых к старым, а разрешение применяет новые последними.
        override_by_key = {item.key: item for item in reversed(overrides)}
        decisions: list[AdminEntitlementDecision] = []
        values: dict[str, bool | int | None] = {
            **{f"feature.{key}": value for key, value in resolved.features.items()},
            **{f"limit.{key}": value for key, value in resolved.limits.items()},
        }
        for key in sorted(values):
            source = resolved.sources[key]
            override = override_by_key.get(key)
            raw_value = values[key]
            decisions.append(
                AdminEntitlementDecision(
                    key=key,
                    kind="feature" if key.startswith("feature.") else "limit",
                    value="unlimited" if raw_value is None else raw_value,
                    source=source,
                    source_label=(
                        "Персональное право"
                        if source == "override"
                        else f"Тариф {resolved.plan_name} v{resolved.plan_version}"
                        if source == "plan"
                        else "Free"
                    ),
                    reason=override.reason if override is not None else None,
                )
            )
        return decisions

    @staticmethod
    def _degradation_preview(
        *,
        resolved_features: dict[str, bool],
        usage: dict[str, int],
        overrides: list[Entitlement],
    ) -> AdminUserDegradationPreview:
        free = load_plan_catalog()["plans"]["free"]
        projected_features = dict(free.get("features", {}))
        projected_limits = dict(free.get("limits", {}))
        for override in overrides:
            if override.key.startswith("feature."):
                projected_features[override.key.removeprefix("feature.")] = bool(override.value)
            elif override.key.startswith("limit."):
                value = override.value
                projected_limits[override.key.removeprefix("limit.")] = (
                    value if type(value) is int else None
                )
        impacts = [
            AdminUserDegradationLimit(
                key=key,
                current=current,
                projected_limit=limit,
                over_by=current - limit,
            )
            for key, current in usage.items()
            if (limit := projected_limits.get(key)) is not None and current > limit
        ]
        return AdminUserDegradationPreview(
            limit_impacts=impacts,
            lost_features=sorted(
                key
                for key, enabled in resolved_features.items()
                if enabled and not projected_features.get(key, False)
            ),
            guarantees=DEGRADATION_GUARANTEES,
        )
