"""Read-only представление состояния продукта для владельца Запоминальни."""

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError
from app.repositories import admin as repo
from app.schemas.admin import (
    AdminOverview,
    AdminUserAccess,
    AdminUserActivity,
    AdminUserDetail,
    AdminUserEntitlementOverride,
    AdminUserItem,
    AdminUserList,
    AdminUserMaterialItem,
    AdminUserMaterials,
    AdminUserPayment,
    AdminUserPromoRedemption,
    AdminUserReferral,
)
from app.services.entitlements import Entitlements


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
                recent=[
                    AdminUserMaterialItem(**item.__dict__) for item in record.materials.recent
                ],
            ),
            activity=AdminUserActivity(**record.activity.__dict__),
            access=AdminUserAccess(
                plan_code=resolved.plan_code,
                plan_name=resolved.plan_name,
                current_period_end=resolved.current_period_end,
                cancel_at_period_end=resolved.cancel_at_period_end,
                features=resolved.features,
                limits=resolved.limits,
                usage=usage,
                remaining=remaining,
                overrides=[
                    AdminUserEntitlementOverride(
                        key=item.key,
                        value=item.value,
                        source=item.source.value,
                        reason=item.reason,
                        starts_at=item.starts_at,
                        valid_until=item.valid_until,
                    )
                    for item in record.overrides
                ],
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
