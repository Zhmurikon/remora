"""Агрегаты административной панели без решений о правах доступа."""

from __future__ import annotations

from contextlib import suppress
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from app.models.billing import (
    Entitlement,
    Payment,
    Plan,
    PromoCode,
    PromoRedemption,
    Referral,
    ReferralCode,
    ReferralStatus,
)
from app.models.content import StudySet
from app.models.courses import Course
from app.models.moderation import CourseReport, ReportStatus
from app.models.study import Review
from app.models.tts import UsageCounter
from app.models.user import OauthAccount, User


@dataclass(frozen=True)
class OverviewRecord:
    users_total: int
    users_new_7d: int
    users_active_7d: int
    reviews_7d: int
    sets_total: int
    courses_total: int
    courses_published: int
    reports_open: int


@dataclass(frozen=True)
class UserRecord:
    user: User
    last_active_at: datetime | None
    sets_count: int
    courses_count: int
    reviews_count: int


@dataclass(frozen=True)
class MaterialRecord:
    id: UUID
    kind: str
    title: str
    status: str
    items_count: int | None
    updated_at: datetime


@dataclass(frozen=True)
class MaterialsRecord:
    sets_total: int
    sets_archived: int
    cards_total: int
    courses_total: int
    courses_published: int
    recent: list[MaterialRecord]


@dataclass(frozen=True)
class ActivityRecord:
    reviews_total: int
    reviews_7d: int
    reviews_30d: int
    active_days_30d: int
    last_active_at: datetime | None


@dataclass(frozen=True)
class PaymentRecord:
    payment: Payment
    plan: Plan
    promo_code: str | None


@dataclass(frozen=True)
class PromoRedemptionRecord:
    code: PromoCode
    redeemed_at: datetime


@dataclass(frozen=True)
class ReferralRecord:
    code: str | None
    invited_by_username: str | None
    invited_total: int
    rewarded_total: int


@dataclass(frozen=True)
class UserDetailRecord:
    user: User
    oauth_providers: list[str]
    materials: MaterialsRecord
    activity: ActivityRecord
    overrides: list[Entitlement]
    counter_usage: dict[str, int]
    payments: list[PaymentRecord]
    promo_redemptions: list[PromoRedemptionRecord]
    referral: ReferralRecord


async def overview(db: AsyncSession, *, now: datetime | None = None) -> OverviewRecord:
    since = (now or datetime.now(UTC)) - timedelta(days=7)
    query = select(
        select(func.count(User.id)).scalar_subquery(),
        select(func.count(User.id)).where(User.created_at >= since).scalar_subquery(),
        select(func.count(func.distinct(Review.user_id)))
        .where(Review.reviewed_at >= since)
        .scalar_subquery(),
        select(func.count(Review.id)).where(Review.reviewed_at >= since).scalar_subquery(),
        select(func.count(StudySet.id)).where(StudySet.deleted_at.is_(None)).scalar_subquery(),
        select(func.count(Course.id)).scalar_subquery(),
        select(func.count(Course.id)).where(Course.is_published.is_(True)).scalar_subquery(),
        select(func.count(CourseReport.id))
        .where(CourseReport.status == ReportStatus.open.value)
        .scalar_subquery(),
    )
    row = (await db.execute(query)).one()
    return OverviewRecord(*(int(value or 0) for value in row))


def _search_filter(query: str) -> ColumnElement[bool]:
    escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    conditions: list[ColumnElement[bool]] = [
        User.username.ilike(f"%{escaped}%", escape="\\"),
        User.email.ilike(f"%{escaped}%", escape="\\"),
        User.display_name.ilike(f"%{escaped}%", escape="\\"),
    ]
    with suppress(ValueError):
        conditions.append(User.id == UUID(query))
    return or_(*conditions)


async def users(
    db: AsyncSession,
    *,
    query: str | None,
    offset: int,
    limit: int,
) -> tuple[list[UserRecord], int]:
    filters = [_search_filter(query)] if query else []
    total = int((await db.scalar(select(func.count(User.id)).where(*filters))) or 0)

    set_counts = (
        select(
            StudySet.owner_id.label("user_id"),
            func.count(StudySet.id).label("sets_count"),
        )
        .where(StudySet.deleted_at.is_(None))
        .group_by(StudySet.owner_id)
        .subquery()
    )
    course_counts = (
        select(
            Course.owner_id.label("user_id"),
            func.count(Course.id).label("courses_count"),
        )
        .group_by(Course.owner_id)
        .subquery()
    )
    review_counts = (
        select(
            Review.user_id.label("user_id"),
            func.count(Review.id).label("reviews_count"),
            func.max(Review.reviewed_at).label("last_active_at"),
        )
        .group_by(Review.user_id)
        .subquery()
    )
    result = await db.execute(
        select(
            User,
            review_counts.c.last_active_at,
            func.coalesce(set_counts.c.sets_count, 0),
            func.coalesce(course_counts.c.courses_count, 0),
            func.coalesce(review_counts.c.reviews_count, 0),
        )
        .outerjoin(set_counts, set_counts.c.user_id == User.id)
        .outerjoin(course_counts, course_counts.c.user_id == User.id)
        .outerjoin(review_counts, review_counts.c.user_id == User.id)
        .where(*filters)
        .order_by(User.created_at.desc(), User.id.desc())
        .offset(offset)
        .limit(limit)
    )
    items = [
        UserRecord(
            user=row[0],
            last_active_at=row[1],
            sets_count=int(row[2]),
            courses_count=int(row[3]),
            reviews_count=int(row[4]),
        )
        for row in result.all()
    ]
    return items, total


async def user_detail(db: AsyncSession, user_id: UUID, *, now: datetime) -> UserDetailRecord | None:
    user = await db.get(User, user_id)
    if user is None:
        return None

    since_7d = now - timedelta(days=7)
    since_30d = now - timedelta(days=30)
    material_totals = (
        await db.execute(
            select(
                select(func.count(StudySet.id))
                .where(StudySet.owner_id == user_id, StudySet.deleted_at.is_(None))
                .scalar_subquery(),
                select(func.count(StudySet.id))
                .where(StudySet.owner_id == user_id, StudySet.deleted_at.is_not(None))
                .scalar_subquery(),
                select(func.coalesce(func.sum(StudySet.cards_count), 0))
                .where(StudySet.owner_id == user_id, StudySet.deleted_at.is_(None))
                .scalar_subquery(),
                select(func.count(Course.id))
                .where(Course.owner_id == user_id)
                .scalar_subquery(),
                select(func.count(Course.id))
                .where(Course.owner_id == user_id, Course.is_published.is_(True))
                .scalar_subquery(),
            )
        )
    ).one()
    recent_sets = (
        await db.scalars(
            select(StudySet)
            .where(StudySet.owner_id == user_id)
            .order_by(StudySet.updated_at.desc())
            .limit(5)
        )
    ).all()
    recent_courses = (
        await db.scalars(
            select(Course)
            .where(Course.owner_id == user_id)
            .order_by(Course.updated_at.desc())
            .limit(5)
        )
    ).all()
    recent = sorted(
        [
            MaterialRecord(
                id=item.id,
                kind="set",
                title=item.title,
                status="archived" if item.deleted_at else item.visibility.value,
                items_count=item.cards_count,
                updated_at=item.updated_at,
            )
            for item in recent_sets
        ]
        + [
            MaterialRecord(
                id=item.id,
                kind="course",
                title=item.title,
                status=(
                    "blocked"
                    if item.moderation_status == "blocked"
                    else "published"
                    if item.is_published
                    else "draft"
                ),
                items_count=None,
                updated_at=item.updated_at,
            )
            for item in recent_courses
        ],
        key=lambda item: item.updated_at,
        reverse=True,
    )[:8]

    activity_row = (
        await db.execute(
            select(
                func.count(Review.id),
                func.count(Review.id).filter(Review.reviewed_at >= since_7d),
                func.count(Review.id).filter(Review.reviewed_at >= since_30d),
                func.count(func.distinct(func.date(Review.reviewed_at))).filter(
                    Review.reviewed_at >= since_30d
                ),
                func.max(Review.reviewed_at),
            ).where(Review.user_id == user_id)
        )
    ).one()

    overrides = list(
        (
            await db.scalars(
                select(Entitlement)
                .where(
                    Entitlement.user_id == user_id,
                    Entitlement.starts_at <= now,
                    or_(Entitlement.valid_until.is_(None), Entitlement.valid_until > now),
                )
                .order_by(Entitlement.created_at.desc())
            )
        ).all()
    )
    counters = (
        await db.scalars(
            select(UsageCounter)
            .where(UsageCounter.user_id == user_id)
            .order_by(UsageCounter.metric, UsageCounter.updated_at.desc())
        )
    ).all()
    counter_usage: dict[str, int] = {}
    for counter in counters:
        counter_usage.setdefault(counter.metric, int(counter.value))

    payment_rows = (
        await db.execute(
            select(Payment, Plan, PromoCode.code)
            .join(Plan, Plan.id == Payment.plan_id)
            .outerjoin(PromoCode, PromoCode.id == Payment.promo_code_id)
            .where(Payment.user_id == user_id)
            .order_by(Payment.created_at.desc())
            .limit(20)
        )
    ).all()
    payments = [PaymentRecord(row[0], row[1], row[2]) for row in payment_rows]

    promo_rows = (
        await db.execute(
            select(PromoCode, PromoRedemption.redeemed_at)
            .join(PromoRedemption, PromoRedemption.promo_code_id == PromoCode.id)
            .where(PromoRedemption.user_id == user_id)
            .order_by(PromoRedemption.redeemed_at.desc())
        )
    ).all()

    referral_code = await db.scalar(
        select(ReferralCode.code).where(ReferralCode.user_id == user_id)
    )
    inviter_username = await db.scalar(
        select(User.username)
        .join(Referral, Referral.inviter_id == User.id)
        .where(Referral.invited_user_id == user_id)
    )
    referral_counts = (
        await db.execute(
            select(
                func.count(Referral.id),
                func.coalesce(
                    func.sum(case((Referral.status == ReferralStatus.rewarded, 1), else_=0)),
                    0,
                ),
            ).where(Referral.inviter_id == user_id)
        )
    ).one()

    oauth_providers = list(
        await db.scalars(
            select(OauthAccount.provider)
            .where(OauthAccount.user_id == user_id)
            .order_by(OauthAccount.provider)
        )
    )
    return UserDetailRecord(
        user=user,
        oauth_providers=oauth_providers,
        materials=MaterialsRecord(
            sets_total=int(material_totals[0] or 0),
            sets_archived=int(material_totals[1] or 0),
            cards_total=int(material_totals[2] or 0),
            courses_total=int(material_totals[3] or 0),
            courses_published=int(material_totals[4] or 0),
            recent=recent,
        ),
        activity=ActivityRecord(
            reviews_total=int(activity_row[0] or 0),
            reviews_7d=int(activity_row[1] or 0),
            reviews_30d=int(activity_row[2] or 0),
            active_days_30d=int(activity_row[3] or 0),
            last_active_at=activity_row[4],
        ),
        overrides=overrides,
        counter_usage=counter_usage,
        payments=payments,
        promo_redemptions=[PromoRedemptionRecord(row[0], row[1]) for row in promo_rows],
        referral=ReferralRecord(
            code=referral_code,
            invited_by_username=inviter_username,
            invited_total=int(referral_counts[0] or 0),
            rewarded_total=int(referral_counts[1] or 0),
        ),
    )
