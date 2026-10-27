"""Безопасные контракты платежей и подписок для административной панели."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class AdminPaymentRefund(BaseModel):
    provider_refund_id: str | None
    status: str
    amount: int | None
    created_at: datetime | None


class AdminPaymentItem(BaseModel):
    id: UUID
    provider_payment_id: str | None
    user_id: UUID
    username: str
    email: str | None
    plan_code: str
    plan_name: str
    interval: str
    status: str
    amount: int
    discount_amount: int
    currency: str
    created_at: datetime
    paid_at: datetime | None
    refund: AdminPaymentRefund | None


class AdminPaymentList(BaseModel):
    items: list[AdminPaymentItem]
    total: int
    offset: int
    limit: int


class AdminPaymentEventItem(BaseModel):
    id: UUID
    event: str
    provider_payment_id: str
    received_at: datetime
    processed_at: datetime | None


class AdminSubscriptionItem(BaseModel):
    id: UUID
    plan_code: str
    plan_name: str
    status: str
    interval: str
    current_period_start: datetime
    current_period_end: datetime
    cancel_at_period_end: bool
    ended_at: datetime | None


class AdminPaymentAuditItem(BaseModel):
    id: UUID
    action: str
    actor_username: str | None
    reason: str | None
    created_at: datetime


class AdminPaymentDetail(AdminPaymentItem):
    receipt_url: str | None
    subscriptions: list[AdminSubscriptionItem]
    events: list[AdminPaymentEventItem]
    history: list[AdminPaymentAuditItem]


class AdminBillingAction(BaseModel):
    reason: str = Field(min_length=10, max_length=500)
