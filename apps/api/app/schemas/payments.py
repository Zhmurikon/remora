from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class CheckoutRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    plan_code: Literal["plus", "pro"]
    interval: Literal["month", "year"]
    request_key: UUID
    promo_code: str | None = Field(default=None, min_length=2, max_length=48)


class CheckoutResponse(BaseModel):
    payment_id: UUID
    confirmation_url: str
    amount: int
    currency: str


class PaymentPublic(BaseModel):
    id: UUID
    plan_code: str
    plan_name: str
    interval: str
    status: str
    amount: int
    discount_amount: int
    currency: str
    receipt_url: str | None
    created_at: datetime
    paid_at: datetime | None


class SubscriptionPublic(BaseModel):
    plan_code: str
    plan_name: str
    status: str
    interval: str
    current_period_start: datetime
    current_period_end: datetime
    cancel_at_period_end: bool


class BillingOverview(BaseModel):
    subscription: SubscriptionPublic | None
    payments: list[PaymentPublic]
    referral_code: str


class YooKassaNotification(BaseModel):
    model_config = ConfigDict(extra="allow")
    type: Literal["notification"]
    event: Literal["payment.succeeded", "payment.canceled", "refund.succeeded"]
    object: dict[str, Any]
