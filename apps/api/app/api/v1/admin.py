"""Просмотр продукта и защищённое управление пользователями."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import admin_user, confirmed_admin_user
from app.db.session import get_db
from app.models.user import User, UserRole, UserStatus
from app.schemas.admin import (
    AdminOverview,
    AdminUserDetail,
    AdminUserEntitlementGrant,
    AdminUserEntitlementRevoke,
    AdminUserList,
    AdminUserRoleUpdate,
    AdminUserStatusUpdate,
)
from app.services.admin import AdminService

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/overview", response_model=AdminOverview, summary="Сводка продукта")
async def get_overview(
    _: User = Depends(admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminOverview:
    return await AdminService(db).overview()


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


def _request_context(request: Request) -> tuple[str | None, str | None]:
    return (
        request.client.host if request.client else None,
        request.headers.get("user-agent"),
    )


IdempotencyKey = Annotated[
    str,
    Header(alias="Idempotency-Key", min_length=16, max_length=64),
]


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
