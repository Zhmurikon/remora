from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.billing import EntitlementsPublic, PlanPublic
from app.schemas.payments import (
    BillingOverview,
    CheckoutRequest,
    CheckoutResponse,
    SubscriptionPublic,
    YooKassaNotification,
)
from app.services.billing import BillingService
from app.services.entitlements import Entitlements
from app.services.plans import public_plans

router = APIRouter(prefix="/billing", tags=["billing"])


@router.get("/plans", response_model=list[PlanPublic], summary="Тарифы")
async def list_plans() -> list[PlanPublic]:
    return public_plans()


@router.get("/entitlements", response_model=EntitlementsPublic, summary="Мой тариф и квоты")
async def my_entitlements(
    response: Response,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> EntitlementsPublic:
    response.headers["Cache-Control"] = "no-store"
    entitlements = Entitlements(db)
    resolved = await entitlements.resolve(user)
    usage = await entitlements.creation_quota_usage(user)
    remaining = entitlements.quota_remaining(resolved.limits, usage)
    return EntitlementsPublic(
        plan_code=resolved.plan_code,
        plan_name=resolved.plan_name,
        features=resolved.features,
        limits=resolved.limits,
        usage=usage,
        remaining=remaining,
        current_period_end=resolved.current_period_end,
        cancel_at_period_end=resolved.cancel_at_period_end,
    )


@router.get("/overview", response_model=BillingOverview, summary="Подписка и платежи")
async def billing_overview(
    response: Response,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> BillingOverview:
    response.headers["Cache-Control"] = "no-store"
    return await BillingService(db).overview(user)


@router.post("/checkout", response_model=CheckoutResponse, status_code=status.HTTP_201_CREATED)
async def create_checkout(
    body: CheckoutRequest,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> CheckoutResponse:
    return await BillingService(db).checkout(user, body)


@router.post("/cancel", response_model=SubscriptionPublic, summary="Отменить продление")
async def cancel_subscription(
    user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> SubscriptionPublic:
    return await BillingService(db).cancel(user)


@router.post("/webhooks/yookassa", status_code=status.HTTP_200_OK, include_in_schema=False)
async def yookassa_webhook(body: YooKassaNotification, db: AsyncSession = Depends(get_db)) -> None:
    await BillingService(db).webhook(body)
