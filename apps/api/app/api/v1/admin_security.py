"""Отдельный защищённый вход и аудит административной панели."""

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import admin_user
from app.core.config import get_settings
from app.core.rate_limit import enforce_rate_limit
from app.core.security import hash_token
from app.db.session import get_db
from app.models.user import User
from app.schemas.admin_security import (
    AdminAuditList,
    AdminCodeRequest,
    AdminConfirmationRequest,
    AdminConfirmationResponse,
    AdminLoginRequest,
    AdminLoginStep,
    AdminSecurityStatus,
    AdminSessionResponse,
    AdminSetupRequest,
    AdminSetupResponse,
)
from app.services.admin_security import AdminSecurityService, AdminSession
from app.services.auth import to_user_public

router = APIRouter(prefix="/admin", tags=["admin-security"])


def _request_context(request: Request) -> tuple[str | None, str | None]:
    return (
        request.client.host if request.client else None,
        request.headers.get("user-agent"),
    )


def _set_refresh_cookie(response: Response, token: str, expires_at: datetime) -> None:
    settings = get_settings()
    response.set_cookie(
        key=settings.refresh_cookie_name,
        value=token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        domain=settings.cookie_domain,
        max_age=int((expires_at - datetime.now(tz=UTC)).total_seconds()),
        path="/api/v1/auth",
    )


def _session_response(response: Response, session: AdminSession) -> AdminSessionResponse:
    _set_refresh_cookie(response, session.refresh_token, session.expires_at)
    response.headers["Cache-Control"] = "no-store"
    return AdminSessionResponse(
        access_token=session.access_token,
        user=to_user_public(session.user),
        recovery_codes=session.recovery_codes,
    )


async def _limit_code(request: Request, identity: str) -> None:
    settings = get_settings()
    await enforce_rate_limit(
        scope="admin-2fa",
        ip=request.client.host if request.client else "unknown",
        identity=identity,
        limit=settings.rate_limit_admin_2fa,
        window_seconds=settings.rate_limit_admin_2fa_window_seconds,
    )


@router.post("/auth/login", response_model=AdminLoginStep, summary="Начать вход администратора")
async def admin_login(
    request: Request,
    response: Response,
    body: AdminLoginRequest,
    db: AsyncSession = Depends(get_db),
) -> AdminLoginStep:
    settings = get_settings()
    await enforce_rate_limit(
        scope="admin-login",
        ip=request.client.host if request.client else "unknown",
        identity=body.email,
        limit=settings.rate_limit_login,
        window_seconds=settings.rate_limit_window_seconds,
    )
    ip, user_agent = _request_context(request)
    result = await AdminSecurityService(db).begin_login(
        email=body.email,
        password=body.password,
        ip=ip,
        user_agent=user_agent,
    )
    response.headers["Cache-Control"] = "no-store"
    return result


@router.post(
    "/auth/2fa/setup",
    response_model=AdminSetupResponse,
    summary="Получить секрет первоначальной настройки 2FA",
)
async def admin_2fa_setup(
    request: Request,
    response: Response,
    body: AdminSetupRequest,
    db: AsyncSession = Depends(get_db),
) -> AdminSetupResponse:
    await _limit_code(request, hash_token(body.token))
    ip, user_agent = _request_context(request)
    result = await AdminSecurityService(db).start_setup(
        body.token, ip=ip, user_agent=user_agent
    )
    response.headers["Cache-Control"] = "no-store"
    return result


@router.post(
    "/auth/2fa/enable",
    response_model=AdminSessionResponse,
    summary="Включить 2FA и завершить вход",
)
async def admin_2fa_enable(
    request: Request,
    response: Response,
    body: AdminCodeRequest,
    db: AsyncSession = Depends(get_db),
) -> AdminSessionResponse:
    await _limit_code(request, hash_token(body.token))
    ip, user_agent = _request_context(request)
    session = await AdminSecurityService(db).enable(
        body.token, body.code, ip=ip, user_agent=user_agent
    )
    return _session_response(response, session)


@router.post(
    "/auth/2fa/verify",
    response_model=AdminSessionResponse,
    summary="Проверить второй фактор и завершить вход",
)
async def admin_2fa_verify(
    request: Request,
    response: Response,
    body: AdminCodeRequest,
    db: AsyncSession = Depends(get_db),
) -> AdminSessionResponse:
    await _limit_code(request, hash_token(body.token))
    ip, user_agent = _request_context(request)
    session = await AdminSecurityService(db).verify(
        body.token, body.code, ip=ip, user_agent=user_agent
    )
    return _session_response(response, session)


@router.get(
    "/security/status",
    response_model=AdminSecurityStatus,
    summary="Состояние защиты администратора",
)
async def admin_security_status(
    response: Response,
    user: User = Depends(admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminSecurityStatus:
    response.headers["Cache-Control"] = "no-store"
    return await AdminSecurityService(db).status(user)


@router.post(
    "/security/confirm",
    response_model=AdminConfirmationResponse,
    summary="Повторно подтвердить чувствительное действие",
)
async def admin_security_confirm(
    request: Request,
    response: Response,
    body: AdminConfirmationRequest,
    user: User = Depends(admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminConfirmationResponse:
    await _limit_code(request, str(user.id))
    ip, user_agent = _request_context(request)
    result = await AdminSecurityService(db).confirm(
        user, body.code, ip=ip, user_agent=user_agent
    )
    response.headers["Cache-Control"] = "no-store"
    return result


@router.get("/security/audit", response_model=AdminAuditList, summary="Журнал администратора")
async def admin_audit(
    response: Response,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    _: User = Depends(admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminAuditList:
    response.headers["Cache-Control"] = "no-store"
    return await AdminSecurityService(db).audit(offset=offset, limit=limit)
