from datetime import datetime

from pydantic import BaseModel


class PlanPublic(BaseModel):
    code: str
    name: str
    price_month: int | None
    price_year: int | None
    features: dict[str, bool]
    limits: dict[str, int | None]


class EntitlementsPublic(BaseModel):
    plan_code: str
    plan_name: str
    features: dict[str, bool]
    limits: dict[str, int | None]
    current_period_end: datetime | None
    cancel_at_period_end: bool
