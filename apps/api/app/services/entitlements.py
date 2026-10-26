"""Единая точка разрешения тарифных возможностей и квот."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from functools import lru_cache
from pathlib import Path
from typing import Any, cast
from uuid import UUID

import yaml
from sqlalchemy import and_, func, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import LimitExceededError
from app.models.billing import Entitlement, Plan, Subscription, SubscriptionStatus
from app.models.content import StudySet
from app.models.courses import Course, LibrarySave
from app.models.tts import UsageCounter
from app.models.user import User


@dataclass(frozen=True)
class ResolvedEntitlements:
    plan_code: str
    plan_name: str
    features: dict[str, bool]
    limits: dict[str, int | None]
    current_period_end: datetime | None = None
    cancel_at_period_end: bool = False


@lru_cache(maxsize=1)
def load_plan_catalog() -> dict[str, Any]:
    path = Path(__file__).parents[1] / "config" / "plans.yaml"
    payload = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict) or not isinstance(payload.get("plans"), dict):
        raise RuntimeError("Некорректный каталог тарифов")
    return cast(dict[str, Any], payload)


def week_period(moment: datetime | None = None) -> tuple[str, datetime]:
    now = moment or datetime.now(UTC)
    start = (now - timedelta(days=now.weekday())).date()
    reset = datetime.combine(start + timedelta(days=7), datetime.min.time(), tzinfo=UTC)
    iso_year, iso_week, _ = start.isocalendar()
    return f"{iso_year}-W{iso_week:02d}", reset


class Entitlements:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def resolve(self, user: User, *, now: datetime | None = None) -> ResolvedEntitlements:
        moment = now or datetime.now(UTC)
        row = (
            await self.db.execute(
                select(Subscription, Plan)
                .join(Plan, Plan.id == Subscription.plan_id)
                .where(
                    Subscription.user_id == user.id,
                    Subscription.current_period_start <= moment,
                    Subscription.status.in_(
                        [
                            SubscriptionStatus.active,
                            SubscriptionStatus.canceled,
                            SubscriptionStatus.past_due,
                        ]
                    ),
                    Subscription.current_period_end > moment,
                )
                .order_by(Subscription.current_period_end.desc())
                .limit(1)
            )
        ).first()

        catalog = load_plan_catalog()["plans"]
        if row is None:
            code = "free"
            plan_data = catalog[code]
            period_end = None
            cancel_at_period_end = False
        else:
            subscription, plan = row
            code = plan.code
            # Снимок версии в БД сохраняет прежние условия подписчика при изменении YAML.
            plan_data = plan.features
            period_end = subscription.current_period_end
            cancel_at_period_end = subscription.cancel_at_period_end

        features = dict(plan_data.get("features", {}))
        limits = dict(plan_data.get("limits", {}))
        overrides = (
            await self.db.scalars(
                select(Entitlement)
                .where(
                    Entitlement.user_id == user.id,
                    Entitlement.starts_at <= moment,
                    or_(Entitlement.valid_until.is_(None), Entitlement.valid_until > moment),
                )
                .order_by(Entitlement.created_at.asc())
            )
        ).all()
        for override in overrides:
            if override.key.startswith("feature."):
                features[override.key.removeprefix("feature.")] = bool(override.value)
            elif override.key.startswith("limit."):
                value = override.value
                limits[override.key.removeprefix("limit.")] = (
                    int(value) if isinstance(value, int) and not isinstance(value, bool) else None
                )

        return ResolvedEntitlements(
            plan_code=code,
            plan_name=str(plan_data.get("name", code.title())),
            features=features,
            limits=limits,
            current_period_end=period_end,
            cancel_at_period_end=cancel_at_period_end,
        )

    async def feature(self, user: User, key: str) -> bool:
        return (await self.resolve(user)).features.get(key, False)

    async def limit(self, user: User, key: str) -> int | None:
        return (await self.resolve(user)).limits.get(key)

    async def check(
        self,
        user: User,
        key: str,
        *,
        current: int,
        requested: int = 1,
        resets_at: datetime | None = None,
    ) -> None:
        if requested <= 0:
            return
        limit = await self.limit(user, key)
        if limit is None or current + requested <= limit:
            return
        raise LimitExceededError(
            details={
                "limit_key": key,
                "limit": limit,
                "current": current,
                "requested": requested,
                "resets_at": resets_at.isoformat() if resets_at else None,
                "upgrade_to": "plus",
            }
        )

    async def check_course_creation(self, user: User, *, requested: int = 1) -> None:
        current = await self.course_count(user)
        await self.check(
            user, "courses.total", current=current, requested=requested
        )

    async def course_count(self, user: User) -> int:
        current = await self.db.scalar(
            select(func.count(Course.id)).where(Course.owner_id == user.id)
        )
        return int(current or 0)

    async def active_library_set_ids(self, user: User) -> set[UUID]:
        owned = set(
            await self.db.scalars(
                select(StudySet.id).where(
                    StudySet.owner_id == user.id, StudySet.deleted_at.is_(None)
                )
            )
        )
        snapshots = await self.db.scalars(
            select(LibrarySave.accepted_snapshot).where(LibrarySave.user_id == user.id)
        )
        for snapshot in snapshots:
            owned.update(self.snapshot_set_ids(snapshot))
        return owned

    async def check_set_creation(self, user: User, *, requested: int = 1) -> None:
        current = len(await self.active_library_set_ids(user))
        await self.check(
            user, "sets.library_total", current=current, requested=requested
        )

    async def check_library_snapshot(self, user: User, snapshot: dict[str, Any]) -> None:
        current_ids = await self.active_library_set_ids(user)
        requested_ids = self.snapshot_set_ids(snapshot) - current_ids
        await self.check(
            user,
            "sets.library_total",
            current=len(current_ids),
            requested=len(requested_ids),
        )

    async def creation_quota_usage(self, user: User) -> dict[str, int]:
        return {
            "courses.total": await self.course_count(user),
            "sets.library_total": len(await self.active_library_set_ids(user)),
        }

    @staticmethod
    def quota_remaining(
        limits: dict[str, int | None], usage: dict[str, int]
    ) -> dict[str, int | None]:
        remaining: dict[str, int | None] = {}
        for key, current in usage.items():
            limit = limits.get(key)
            remaining[key] = None if limit is None else max(limit - current, 0)
        return remaining

    @staticmethod
    def snapshot_set_ids(snapshot: dict[str, Any]) -> set[UUID]:
        result: set[UUID] = set()
        for article in snapshot.get("articles", []):
            raw_id = article.get("set", {}).get("id") if isinstance(article, dict) else None
            try:
                result.add(UUID(str(raw_id)))
            except (TypeError, ValueError):
                continue
        return result

    async def consume(
        self,
        user: User,
        metric: str,
        *,
        amount: int,
        period_key: str,
        resets_at: datetime,
    ) -> int:
        if amount < 1:
            raise ValueError("amount должен быть положительным")
        limit = await self.limit(user, metric)
        if limit is not None and amount > limit:
            await self.check(user, metric, current=0, requested=amount, resets_at=resets_at)

        statement = insert(UsageCounter).values(
            user_id=user.id, metric=metric, period_key=period_key, value=amount
        )
        if limit is None:
            statement = statement.on_conflict_do_update(
                constraint="uq_usage_counters_user_id_metric_period_key",
                set_={"value": UsageCounter.value + amount},
            )
        else:
            statement = statement.on_conflict_do_update(
                constraint="uq_usage_counters_user_id_metric_period_key",
                set_={"value": UsageCounter.value + amount},
                where=UsageCounter.value + amount <= limit,
            )
        value = await self.db.scalar(statement.returning(UsageCounter.value))
        if value is not None:
            return int(value)

        current = await self.db.scalar(
            select(UsageCounter.value).where(
                and_(
                    UsageCounter.user_id == user.id,
                    UsageCounter.metric == metric,
                    UsageCounter.period_key == period_key,
                )
            )
        )
        await self.check(
            user, metric, current=int(current or 0), requested=amount, resets_at=resets_at
        )
        raise RuntimeError("Счётчик квоты не обновлён")
