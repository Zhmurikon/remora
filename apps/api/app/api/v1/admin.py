"""Административный контур: 2FA, пользователи и фоновые задания."""

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import admin_identity, admin_user
from app.core.security import create_jwt
from app.db.session import get_db
from app.models.user import User
from app.schemas.admin import (
    AdminChallengeResult,
    AdminDashboard,
    AdminSecondFactorEnabled,
    AdminSecondFactorSetup,
    AdminSecondFactorSetupResult,
    AdminSecondFactorStatus,
    AdminSecondFactorVerify,
    AdminTaskItem,
    AdminUserItem,
    AdminUserUpdate,
)
from app.services.admin import AdminService

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/2fa/status", response_model=AdminSecondFactorStatus)
async def factor_status(
    user: User = Depends(admin_identity), db: AsyncSession = Depends(get_db)
) -> AdminSecondFactorStatus:
    factor = await AdminService(db).factor(user.id)
    return AdminSecondFactorStatus(
        configured=factor is not None,
        enabled=factor is not None and factor.enabled_at is not None,
        recovery_codes_left=len(factor.recovery_hashes) if factor is not None else 0,
    )


@router.post("/2fa/setup", response_model=AdminSecondFactorSetupResult)
async def factor_setup(
    body: AdminSecondFactorSetup,
    user: User = Depends(admin_identity),
    db: AsyncSession = Depends(get_db),
) -> AdminSecondFactorSetupResult:
    secret, uri = await AdminService(db).setup(user, body.password)
    return AdminSecondFactorSetupResult(secret=secret, provisioning_uri=uri)


@router.post("/2fa/enable", response_model=AdminSecondFactorEnabled)
async def factor_enable(
    body: AdminSecondFactorVerify,
    user: User = Depends(admin_identity),
    db: AsyncSession = Depends(get_db),
) -> AdminSecondFactorEnabled:
    recovery = await AdminService(db).enable(user, body.code)
    return AdminSecondFactorEnabled(
        recovery_codes=recovery, admin_token=create_jwt(str(user.id), "admin")
    )


@router.post("/2fa/challenge", response_model=AdminChallengeResult)
async def factor_challenge(
    body: AdminSecondFactorVerify,
    user: User = Depends(admin_identity),
    db: AsyncSession = Depends(get_db),
) -> AdminChallengeResult:
    await AdminService(db).verify(user, body.code)
    return AdminChallengeResult(admin_token=create_jwt(str(user.id), "admin"))


@router.get("/dashboard", response_model=AdminDashboard)
async def dashboard(
    _: User = Depends(admin_user), db: AsyncSession = Depends(get_db)
) -> AdminDashboard:
    return await AdminService(db).dashboard()


@router.get("/users", response_model=list[AdminUserItem])
async def users(
    query: str = Query(default="", max_length=100),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    _: User = Depends(admin_user),
    db: AsyncSession = Depends(get_db),
) -> list[AdminUserItem]:
    return await AdminService(db).users(query.strip(), offset, limit)


@router.patch("/users/{user_id}", response_model=AdminUserItem)
async def update_user(
    user_id: UUID,
    body: AdminUserUpdate,
    actor: User = Depends(admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminUserItem:
    return await AdminService(db).update_user(
        actor, user_id, role=body.role, status=body.status, reason=body.reason
    )


@router.get("/tasks", response_model=list[AdminTaskItem])
async def tasks(
    limit: int = Query(default=50, ge=1, le=200),
    _: User = Depends(admin_user),
    db: AsyncSession = Depends(get_db),
) -> list[AdminTaskItem]:
    return await AdminService(db).tasks(limit)
