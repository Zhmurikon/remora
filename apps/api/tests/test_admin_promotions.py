"""Промокоды и реферальные начисления в административной панели."""

from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from httpx import AsyncClient
from sqlalchemy import func, select

from app.db.session import get_session_factory
from app.models.admin_security import AdminAuditLog
from app.models.billing import (
    BillingInterval,
    Plan,
    Referral,
    ReferralCode,
    ReferralStatus,
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


async def _rewarded_referral(inviter: User, invited: User) -> tuple[UUID, UUID, UUID]:
    async with get_session_factory()() as db:
        await sync_plan_catalog(db)
        plus = await db.scalar(select(Plan).where(Plan.code == "plus", Plan.active.is_(True)))
        assert plus is not None
        now = datetime.now(UTC)
        inviter_subscription = Subscription(
            user_id=inviter.id,
            plan_id=plus.id,
            status=SubscriptionStatus.active,
            interval=BillingInterval.month,
            current_period_start=now,
            current_period_end=now + timedelta(days=30),
        )
        invited_subscription = Subscription(
            user_id=invited.id,
            plan_id=plus.id,
            status=SubscriptionStatus.active,
            interval=BillingInterval.month,
            current_period_start=now + timedelta(days=30),
            current_period_end=now + timedelta(days=60),
        )
        code = ReferralCode(user_id=inviter.id, code=f"RMR-{uuid4().hex[:8].upper()}")
        db.add_all([inviter_subscription, invited_subscription, code])
        await db.flush()
        referral = Referral(
            code_id=code.id,
            inviter_id=inviter.id,
            invited_user_id=invited.id,
            status=ReferralStatus.rewarded,
            rewarded_at=now,
            inviter_subscription_id=inviter_subscription.id,
            invited_subscription_id=invited_subscription.id,
        )
        db.add(referral)
        await db.commit()
        return referral.id, inviter_subscription.id, invited_subscription.id


async def test_admin_creates_lists_and_disables_promo_code(client: AsyncClient) -> None:
    suffix = uuid4().hex[:8]
    admin_username = f"coursepromo-admin-{suffix}"
    await auth(client, f"promo-admin-{suffix}")
    await promote(admin_username, UserRole.admin)

    regular = await auth(client, f"promo-regular-{suffix}")
    forbidden = await client.get("/api/v1/admin/promotions/promo-codes", headers=regular)
    assert forbidden.status_code == 403

    now = datetime.now(UTC)
    create_key = f"promo-create-{uuid4()}"
    headers = await mutation_headers(admin_username, create_key)
    body = {
        "code": f"sale-{suffix}",
        "kind": "percent",
        "value": 15,
        "max_redemptions": 20,
        "starts_at": now.isoformat(),
        "ends_at": (now + timedelta(days=7)).isoformat(),
        "reason": "Сезонная промо-кампания для проверки",
    }
    created = await client.post("/api/v1/admin/promotions/promo-codes", headers=headers, json=body)
    assert created.status_code == 200, created.text
    promo_id = created.json()["id"]
    assert created.json()["code"] == f"SALE-{suffix.upper()}"
    assert created.json()["state"] == "active"
    assert created.json()["redemptions"] == 0

    repeated = await client.post("/api/v1/admin/promotions/promo-codes", headers=headers, json=body)
    assert repeated.status_code == 200, repeated.text
    assert repeated.json()["id"] == promo_id

    listed = await client.get(
        f"/api/v1/admin/promotions/promo-codes?query={suffix}&state=active",
        headers=await verified_admin_headers(admin_username),
    )
    assert listed.status_code == 200, listed.text
    assert listed.json()["total"] == 1

    disabled = await client.post(
        f"/api/v1/admin/promotions/promo-codes/{promo_id}/disable",
        headers=await mutation_headers(admin_username, f"promo-disable-{uuid4()}"),
        json={"reason": "Кампания завершена раньше запланированного срока"},
    )
    assert disabled.status_code == 200, disabled.text
    assert disabled.json()["state"] == "disabled"


async def test_admin_compensates_linked_referral_reward(client: AsyncClient) -> None:
    suffix = uuid4().hex[:8]
    admin_username = f"coursereferral-admin-{suffix}"
    inviter_username = f"coursereferral-inviter-{suffix}"
    invited_username = f"coursereferral-invited-{suffix}"
    await auth(client, f"referral-admin-{suffix}")
    await auth(client, f"referral-inviter-{suffix}")
    await auth(client, f"referral-invited-{suffix}")
    await promote(admin_username, UserRole.admin)
    inviter = await _user(inviter_username)
    invited = await _user(invited_username)
    referral_id, inviter_subscription_id, invited_subscription_id = await _rewarded_referral(
        inviter, invited
    )

    headers = await verified_admin_headers(admin_username)
    listed = await client.get(
        f"/api/v1/admin/promotions/referrals?query={referral_id}&status=rewarded&suspicious=true",
        headers=headers,
    )
    assert listed.status_code == 200, listed.text
    assert listed.json()["total"] == 1
    assert listed.json()["items"][0]["risk_signals"]

    key = f"referral-revoke-{uuid4()}"
    mutation = await mutation_headers(admin_username, key)
    body = {"reason": "Ошибочное реферальное начисление подтверждено поддержкой"}
    revoked = await client.post(
        f"/api/v1/admin/promotions/referrals/{referral_id}/revoke",
        headers=mutation,
        json=body,
    )
    assert revoked.status_code == 200, revoked.text
    assert revoked.json()["status"] == "rejected"
    assert revoked.json()["revoked_at"] is not None

    repeated = await client.post(
        f"/api/v1/admin/promotions/referrals/{referral_id}/revoke",
        headers=mutation,
        json=body,
    )
    assert repeated.status_code == 200, repeated.text

    async with get_session_factory()() as db:
        referral = await db.get(Referral, referral_id)
        inviter_subscription = await db.get(Subscription, inviter_subscription_id)
        invited_subscription = await db.get(Subscription, invited_subscription_id)
        assert referral is not None and referral.status is ReferralStatus.rejected
        assert inviter_subscription is not None
        assert invited_subscription is not None
        assert inviter_subscription.status is SubscriptionStatus.expired
        assert invited_subscription.status is SubscriptionStatus.expired
        assert referral.inviter_subscription_id == inviter_subscription_id
        assert referral.invited_subscription_id == invited_subscription_id
        audits = await db.scalar(
            select(func.count(AdminAuditLog.id)).where(
                AdminAuditLog.action == "admin.promotions.referral_reward_revoked",
                AdminAuditLog.target_id == referral_id,
            )
        )
        assert audits == 1
