"""Каталог тарифов: YAML — источник версий, БД — снимки для подписок."""

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.billing import Plan
from app.schemas.billing import PlanPublic
from app.services.entitlements import load_plan_catalog


def public_plans() -> list[PlanPublic]:
    plans: dict[str, dict[str, Any]] = load_plan_catalog()["plans"]
    return [
        PlanPublic(
            code=code,
            name=data["name"],
            price_month=data.get("price_month"),
            price_year=data.get("price_year"),
            features=data.get("features", {}),
            limits=data.get("limits", {}),
        )
        for code, data in plans.items()
    ]


async def sync_plan_catalog(db: AsyncSession) -> None:
    catalog = load_plan_catalog()
    version = int(catalog["version"])
    plans: dict[str, dict[str, Any]] = catalog["plans"]
    await db.execute(update(Plan).where(Plan.version != version).values(active=False))
    for code, data in plans.items():
        statement = insert(Plan).values(
            code=code,
            version=version,
            name=data["name"],
            features=data,
            price_month=data.get("price_month"),
            price_year=data.get("price_year"),
            effective_from=datetime.now(UTC),
            active=True,
        )
        await db.execute(
            statement.on_conflict_do_nothing(constraint="uq_plans_code_version")
        )
