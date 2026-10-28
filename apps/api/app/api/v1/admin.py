"""Просмотр продукта и защищённое управление пользователями."""

from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import admin_user, confirmed_admin_user
from app.db.session import get_db
from app.models.moderation import ReportStatus
from app.models.user import User, UserRole, UserStatus
from app.schemas.admin import (
    AdminOverview,
    AdminPlanCatalog,
    AdminUserDetail,
    AdminUserEntitlementGrant,
    AdminUserEntitlementRevoke,
    AdminUserList,
    AdminUserRoleUpdate,
    AdminUserStatusUpdate,
)
from app.schemas.admin_billing import (
    AdminBillingAction,
    AdminPaymentDetail,
    AdminPaymentList,
    AdminSubscriptionItem,
)
from app.schemas.admin_blog import (
    AdminBlogPostDetail,
    AdminBlogPostList,
    AdminBlogPublicationAction,
)
from app.schemas.admin_jobs import AdminJobItem, AdminJobKind, AdminJobList, AdminJobRetry
from app.schemas.admin_moderation import (
    AdminModerationCourseAction,
    AdminModerationCourseDetail,
    AdminModerationCourseList,
    AdminModerationReportList,
    AdminModerationResolution,
)
from app.schemas.admin_promotions import (
    AdminPromoCodeCreate,
    AdminPromoCodeItem,
    AdminPromoCodeList,
    AdminPromotionAction,
    AdminReferralItem,
    AdminReferralList,
)
from app.schemas.agent import AgentMediaUpload, AgentMediaUploadResult
from app.schemas.blog import BlogPostUpdate, BlogPostWrite
from app.services.admin import AdminService
from app.services.admin_billing import AdminBillingService
from app.services.admin_blog import AdminBlogService
from app.services.admin_jobs import AdminJobsService
from app.services.admin_moderation import AdminModerationService
from app.services.admin_promotions import AdminPromotionsService
from app.services.agent import AgentService
from app.services.agent_media import AgentMediaService

router = APIRouter(prefix="/admin", tags=["admin"])


def _request_context(request: Request) -> tuple[str | None, str | None]:
    return (
        request.client.host if request.client else None,
        request.headers.get("user-agent"),
    )


IdempotencyKey = Annotated[
    str,
    Header(alias="Idempotency-Key", min_length=16, max_length=64),
]


@router.get("/overview", response_model=AdminOverview, summary="Сводка продукта")
async def get_overview(
    _: User = Depends(admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminOverview:
    return await AdminService(db).overview()


@router.get("/jobs", response_model=AdminJobList, summary="Фоновые операции")
async def list_admin_jobs(
    query: Annotated[str | None, Query(min_length=1, max_length=160)] = None,
    kind: AdminJobKind | None = None,
    status: Annotated[str | None, Query(min_length=1, max_length=32)] = None,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    _: User = Depends(admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminJobList:
    return await AdminJobsService(db).jobs(
        query=query.strip() if query else None,
        kind=kind,
        status=status,
        offset=offset,
        limit=limit,
    )


@router.post(
    "/jobs/{kind}/{job_id}/retry",
    response_model=AdminJobItem,
    summary="Безопасно повторить фоновую операцию",
)
async def retry_admin_job(
    kind: AdminJobKind,
    job_id: UUID,
    body: AdminJobRetry,
    request: Request,
    idempotency_key: IdempotencyKey,
    actor: User = Depends(confirmed_admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminJobItem:
    ip, user_agent = _request_context(request)
    return await AdminJobsService(db).retry(
        actor=actor,
        kind=kind,
        job_id=job_id,
        reason=body.reason,
        idempotency_key=idempotency_key,
        ip=ip,
        user_agent=user_agent,
    )


@router.get("/plans", response_model=AdminPlanCatalog, summary="Активные версии тарифов")
async def list_admin_plans(
    response: Response,
    _: User = Depends(admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminPlanCatalog:
    response.headers["Cache-Control"] = "no-store"
    return await AdminService(db).plans()


@router.get("/users", response_model=AdminUserList, summary="Пользователи")
async def list_users(
    query: Annotated[str | None, Query(min_length=1, max_length=160)] = None,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    _: User = Depends(admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminUserList:
    normalized_query = query.strip() if query else None
    return await AdminService(db).users(
        query=normalized_query or None,
        offset=offset,
        limit=limit,
    )


@router.get("/users/{user_id}", response_model=AdminUserDetail, summary="Карточка пользователя")
async def get_user(
    user_id: UUID,
    response: Response,
    _: User = Depends(admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminUserDetail:
    response.headers["Cache-Control"] = "no-store"
    return await AdminService(db).user(user_id)


@router.patch(
    "/users/{user_id}/role",
    response_model=AdminUserDetail,
    summary="Изменить роль пользователя",
)
async def change_user_role(
    user_id: UUID,
    body: AdminUserRoleUpdate,
    request: Request,
    response: Response,
    idempotency_key: IdempotencyKey,
    actor: User = Depends(confirmed_admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminUserDetail:
    ip, user_agent = _request_context(request)
    response.headers["Cache-Control"] = "no-store"
    return await AdminService(db).change_role(
        actor=actor,
        user_id=user_id,
        role=UserRole(body.role),
        reason=body.reason,
        idempotency_key=idempotency_key,
        ip=ip,
        user_agent=user_agent,
    )


@router.patch(
    "/users/{user_id}/status",
    response_model=AdminUserDetail,
    summary="Приостановить или восстановить пользователя",
)
async def change_user_status(
    user_id: UUID,
    body: AdminUserStatusUpdate,
    request: Request,
    response: Response,
    idempotency_key: IdempotencyKey,
    actor: User = Depends(confirmed_admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminUserDetail:
    ip, user_agent = _request_context(request)
    response.headers["Cache-Control"] = "no-store"
    return await AdminService(db).change_status(
        actor=actor,
        user_id=user_id,
        status=UserStatus(body.status),
        reason=body.reason,
        idempotency_key=idempotency_key,
        ip=ip,
        user_agent=user_agent,
    )


@router.post(
    "/users/{user_id}/entitlements",
    response_model=AdminUserDetail,
    summary="Выдать персональное право",
)
async def grant_user_entitlement(
    user_id: UUID,
    body: AdminUserEntitlementGrant,
    request: Request,
    response: Response,
    idempotency_key: IdempotencyKey,
    actor: User = Depends(confirmed_admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminUserDetail:
    ip, user_agent = _request_context(request)
    response.headers["Cache-Control"] = "no-store"
    return await AdminService(db).grant_entitlement(
        actor=actor,
        user_id=user_id,
        key=body.key,
        value=body.value,
        valid_until=body.valid_until,
        reason=body.reason,
        idempotency_key=idempotency_key,
        ip=ip,
        user_agent=user_agent,
    )


@router.delete(
    "/users/{user_id}/entitlements/{entitlement_id}",
    response_model=AdminUserDetail,
    summary="Отозвать персональное право",
)
async def revoke_user_entitlement(
    user_id: UUID,
    entitlement_id: UUID,
    body: AdminUserEntitlementRevoke,
    request: Request,
    response: Response,
    idempotency_key: IdempotencyKey,
    actor: User = Depends(confirmed_admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminUserDetail:
    ip, user_agent = _request_context(request)
    response.headers["Cache-Control"] = "no-store"
    return await AdminService(db).revoke_entitlement(
        actor=actor,
        user_id=user_id,
        entitlement_id=entitlement_id,
        reason=body.reason,
        idempotency_key=idempotency_key,
        ip=ip,
        user_agent=user_agent,
    )


@router.get(
    "/moderation/reports",
    response_model=AdminModerationReportList,
    summary="Очередь жалоб",
)
async def list_moderation_reports(
    status: ReportStatus | None = Query(default=ReportStatus.open),
    query: Annotated[str | None, Query(min_length=1, max_length=160)] = None,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    _: User = Depends(admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminModerationReportList:
    return await AdminModerationService(db).reports(
        status=status,
        query=query.strip() if query else None,
        offset=offset,
        limit=limit,
    )


@router.get(
    "/moderation/courses",
    response_model=AdminModerationCourseList,
    summary="Публикации для модерации",
)
async def list_moderation_courses(
    query: Annotated[str | None, Query(min_length=1, max_length=160)] = None,
    moderation_status: Literal["pending", "ok", "blocked"] | None = Query(default=None),
    published: bool | None = Query(default=None),
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    _: User = Depends(admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminModerationCourseList:
    return await AdminModerationService(db).courses(
        query=query.strip() if query else None,
        moderation_status=moderation_status,
        published=published,
        offset=offset,
        limit=limit,
    )


@router.get(
    "/moderation/courses/{course_id}",
    response_model=AdminModerationCourseDetail,
    summary="Карточка публикации для модерации",
)
async def get_moderation_course(
    course_id: UUID,
    response: Response,
    _: User = Depends(admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminModerationCourseDetail:
    response.headers["Cache-Control"] = "no-store"
    return await AdminModerationService(db).course(course_id)


@router.post(
    "/moderation/reports/{report_id}/resolve",
    response_model=AdminModerationCourseDetail,
    summary="Разобрать жалобу",
)
async def resolve_moderation_report(
    report_id: UUID,
    body: AdminModerationResolution,
    request: Request,
    response: Response,
    idempotency_key: IdempotencyKey,
    actor: User = Depends(confirmed_admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminModerationCourseDetail:
    ip, user_agent = _request_context(request)
    response.headers["Cache-Control"] = "no-store"
    return await AdminModerationService(db).resolve_report(
        actor=actor,
        report_id=report_id,
        outcome=ReportStatus(body.outcome),
        reason=body.reason,
        idempotency_key=idempotency_key,
        ip=ip,
        user_agent=user_agent,
    )


@router.post(
    "/moderation/courses/{course_id}/actions",
    response_model=AdminModerationCourseDetail,
    summary="Изменить состояние публикации",
)
async def act_on_moderation_course(
    course_id: UUID,
    body: AdminModerationCourseAction,
    request: Request,
    response: Response,
    idempotency_key: IdempotencyKey,
    actor: User = Depends(confirmed_admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminModerationCourseDetail:
    ip, user_agent = _request_context(request)
    response.headers["Cache-Control"] = "no-store"
    return await AdminModerationService(db).act_on_course(
        actor=actor,
        course_id=course_id,
        action=body.action,
        reason=body.reason,
        idempotency_key=idempotency_key,
        ip=ip,
        user_agent=user_agent,
    )


@router.get("/billing/payments", response_model=AdminPaymentList, summary="Платежи")
async def list_admin_payments(
    query: Annotated[str | None, Query(min_length=1, max_length=160)] = None,
    status: Literal["pending", "succeeded", "canceled", "refunded"] | None = Query(default=None),
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    _: User = Depends(admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminPaymentList:
    return await AdminBillingService(db).payments(
        query=query.strip() if query else None,
        status=status,
        offset=offset,
        limit=limit,
    )


@router.get(
    "/billing/payments/{payment_id}", response_model=AdminPaymentDetail, summary="Карточка платежа"
)
async def get_admin_payment(
    payment_id: UUID,
    response: Response,
    _: User = Depends(admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminPaymentDetail:
    response.headers["Cache-Control"] = "no-store"
    return await AdminBillingService(db).payment(payment_id)


@router.post(
    "/billing/payments/{payment_id}/refund",
    response_model=AdminPaymentDetail,
    summary="Запросить полный возврат",
)
async def refund_admin_payment(
    payment_id: UUID,
    body: AdminBillingAction,
    request: Request,
    response: Response,
    idempotency_key: IdempotencyKey,
    actor: User = Depends(confirmed_admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminPaymentDetail:
    ip, user_agent = _request_context(request)
    response.headers["Cache-Control"] = "no-store"
    return await AdminBillingService(db).refund(
        actor=actor,
        payment_id=payment_id,
        reason=body.reason,
        idempotency_key=idempotency_key,
        ip=ip,
        user_agent=user_agent,
    )


@router.post(
    "/billing/subscriptions/{subscription_id}/cancel",
    response_model=AdminSubscriptionItem,
    summary="Отменить продление подписки",
)
async def cancel_admin_subscription(
    subscription_id: UUID,
    body: AdminBillingAction,
    request: Request,
    response: Response,
    idempotency_key: IdempotencyKey,
    actor: User = Depends(confirmed_admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminSubscriptionItem:
    ip, user_agent = _request_context(request)
    response.headers["Cache-Control"] = "no-store"
    return await AdminBillingService(db).cancel_subscription(
        actor=actor,
        subscription_id=subscription_id,
        reason=body.reason,
        idempotency_key=idempotency_key,
        ip=ip,
        user_agent=user_agent,
    )


@router.post(
    "/billing/events/{event_id}/retry",
    response_model=AdminPaymentDetail,
    summary="Повторить обработку события",
)
async def retry_admin_payment_event(
    event_id: UUID,
    body: AdminBillingAction,
    request: Request,
    response: Response,
    idempotency_key: IdempotencyKey,
    actor: User = Depends(confirmed_admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminPaymentDetail:
    ip, user_agent = _request_context(request)
    response.headers["Cache-Control"] = "no-store"
    return await AdminBillingService(db).retry_event(
        actor=actor,
        event_id=event_id,
        reason=body.reason,
        idempotency_key=idempotency_key,
        ip=ip,
        user_agent=user_agent,
    )


@router.get(
    "/promotions/promo-codes",
    response_model=AdminPromoCodeList,
    summary="Промокоды",
)
async def list_admin_promo_codes(
    query: Annotated[str | None, Query(min_length=1, max_length=160)] = None,
    state: Literal["scheduled", "active", "expired", "disabled", "exhausted"] | None = Query(
        default=None
    ),
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    _: User = Depends(admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminPromoCodeList:
    return await AdminPromotionsService(db).promo_codes(
        query=query.strip() if query else None,
        state=state,
        offset=offset,
        limit=limit,
    )


@router.post(
    "/promotions/promo-codes",
    response_model=AdminPromoCodeItem,
    summary="Создать промокод",
)
async def create_admin_promo_code(
    body: AdminPromoCodeCreate,
    request: Request,
    response: Response,
    idempotency_key: IdempotencyKey,
    actor: User = Depends(confirmed_admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminPromoCodeItem:
    ip, user_agent = _request_context(request)
    response.headers["Cache-Control"] = "no-store"
    return await AdminPromotionsService(db).create_promo(
        actor=actor,
        body=body,
        idempotency_key=idempotency_key,
        ip=ip,
        user_agent=user_agent,
    )


@router.post(
    "/promotions/promo-codes/{promo_id}/disable",
    response_model=AdminPromoCodeItem,
    summary="Отключить промокод",
)
async def disable_admin_promo_code(
    promo_id: UUID,
    body: AdminPromotionAction,
    request: Request,
    response: Response,
    idempotency_key: IdempotencyKey,
    actor: User = Depends(confirmed_admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminPromoCodeItem:
    ip, user_agent = _request_context(request)
    response.headers["Cache-Control"] = "no-store"
    return await AdminPromotionsService(db).disable_promo(
        actor=actor,
        promo_id=promo_id,
        reason=body.reason,
        idempotency_key=idempotency_key,
        ip=ip,
        user_agent=user_agent,
    )


@router.get(
    "/promotions/referrals",
    response_model=AdminReferralList,
    summary="Реферальные начисления",
)
async def list_admin_referrals(
    query: Annotated[str | None, Query(min_length=1, max_length=160)] = None,
    status: Literal["registered", "rewarded", "rejected"] | None = Query(default=None),
    suspicious: bool | None = Query(default=None),
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    _: User = Depends(admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminReferralList:
    return await AdminPromotionsService(db).referrals(
        query=query.strip() if query else None,
        status=status,
        suspicious=suspicious,
        offset=offset,
        limit=limit,
    )


@router.post(
    "/promotions/referrals/{referral_id}/revoke",
    response_model=AdminReferralItem,
    summary="Компенсировать реферальное начисление",
)
async def revoke_admin_referral_reward(
    referral_id: UUID,
    body: AdminPromotionAction,
    request: Request,
    response: Response,
    idempotency_key: IdempotencyKey,
    actor: User = Depends(confirmed_admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminReferralItem:
    ip, user_agent = _request_context(request)
    response.headers["Cache-Control"] = "no-store"
    return await AdminPromotionsService(db).revoke_referral_reward(
        actor=actor,
        referral_id=referral_id,
        reason=body.reason,
        idempotency_key=idempotency_key,
        ip=ip,
        user_agent=user_agent,
    )


@router.get("/blog/posts", response_model=AdminBlogPostList, summary="Публикации блога")
async def list_blog_posts(
    query: Annotated[str | None, Query(min_length=1, max_length=160)] = None,
    status: Literal["draft", "scheduled", "published"] | None = Query(default=None),
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    _: User = Depends(admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminBlogPostList:
    return await AdminBlogService(db).posts(
        query=query.strip() if query else None,
        status=status,
        offset=offset,
        limit=limit,
    )


@router.post(
    "/blog/media",
    response_model=AgentMediaUploadResult,
    status_code=201,
    summary="Загрузить изображение блога",
)
async def upload_blog_media(
    body: AgentMediaUpload,
    idempotency_key: IdempotencyKey,
    actor: User = Depends(admin_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    return await AgentService(db).once(
        actor,
        idempotency_key,
        "admin-upload-blog-media",
        body,
        lambda: AgentMediaService(db).upload(actor, body),
    )


@router.get(
    "/blog/posts/{post_id}", response_model=AdminBlogPostDetail, summary="Редакционная статья"
)
async def get_blog_post(
    post_id: UUID,
    response: Response,
    _: User = Depends(admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminBlogPostDetail:
    response.headers["Cache-Control"] = "no-store"
    return await AdminBlogService(db).post(post_id)


@router.post(
    "/blog/posts", response_model=AdminBlogPostDetail, status_code=201, summary="Создать статью"
)
async def create_blog_post(
    body: BlogPostWrite,
    request: Request,
    response: Response,
    idempotency_key: IdempotencyKey,
    actor: User = Depends(admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminBlogPostDetail:
    ip, user_agent = _request_context(request)
    response.headers["Cache-Control"] = "no-store"
    return await AdminBlogService(db).create(
        actor=actor,
        body=body,
        idempotency_key=idempotency_key,
        ip=ip,
        user_agent=user_agent,
    )


@router.put("/blog/posts/{post_id}", response_model=AdminBlogPostDetail, summary="Сохранить статью")
async def update_blog_post(
    post_id: UUID,
    body: BlogPostUpdate,
    request: Request,
    response: Response,
    idempotency_key: IdempotencyKey,
    actor: User = Depends(admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminBlogPostDetail:
    ip, user_agent = _request_context(request)
    response.headers["Cache-Control"] = "no-store"
    return await AdminBlogService(db).update(
        actor=actor,
        post_id=post_id,
        body=body,
        idempotency_key=idempotency_key,
        ip=ip,
        user_agent=user_agent,
    )


@router.post(
    "/blog/posts/{post_id}/publication",
    response_model=AdminBlogPostDetail,
    summary="Изменить публикацию статьи",
)
async def change_blog_publication(
    post_id: UUID,
    body: AdminBlogPublicationAction,
    request: Request,
    response: Response,
    idempotency_key: IdempotencyKey,
    actor: User = Depends(confirmed_admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminBlogPostDetail:
    ip, user_agent = _request_context(request)
    response.headers["Cache-Control"] = "no-store"
    return await AdminBlogService(db).publication_action(
        actor=actor,
        post_id=post_id,
        action=body.action,
        revision=body.revision,
        reason=body.reason,
        publish_at=body.publish_at,
        idempotency_key=idempotency_key,
        ip=ip,
        user_agent=user_agent,
    )
