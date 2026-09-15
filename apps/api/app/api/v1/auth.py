"""Роутер аутентификации.

Эндпоинты:
- POST /auth/register    — регистрация по email+пароль
- POST /auth/verify-email — подтверждение email
- POST /auth/login       — вход
- POST /auth/refresh      — ротация refresh-токена (читает cookie)
- POST /auth/logout       — отзыв сессии
- POST /auth/password-reset      — запрос сброса пароля
- POST /auth/password-reset/confirm — сброс пароля
- GET  /auth/me           — текущий пользователь
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Cookie, Depends, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import current_user
from app.core.config import get_settings
from app.core.errors import UnauthorizedError
from app.core.rate_limit import enforce_rate_limit
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import (
    LoginRequest,
    PasswordResetConfirmRequest,
    PasswordResetRequest,
    RefreshResponse,
    RegisterRequest,
    TokenResponse,
    UserPublic,
    VerifyEmailRequest,
)
from app.services.auth import AuthService, to_user_public

router = APIRouter(prefix="/auth", tags=["auth"])


def _set_refresh_cookie(
    response: Response,
    token: str,
    expires_at: datetime,
) -> None:
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


def _clear_refresh_cookie(response: Response) -> None:
    settings = get_settings()
    response.delete_cookie(
        key=settings.refresh_cookie_name,
        path="/api/v1/auth",
        domain=settings.cookie_domain,
    )


@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Регистрация",
)
async def register(
    request: Request,
    body: RegisterRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    settings = get_settings()
    await enforce_rate_limit(
        scope="register",
        ip=request.client.host if request.client else "unknown",
        identity=body.email,
        limit=settings.rate_limit_register,
        window_seconds=settings.rate_limit_window_seconds,
    )
    service = AuthService(db)
    user, _ = await service.register(
        email=body.email,
        password=body.password,
        username=body.username,
        birth_date=body.birth_date,
    )
    return TokenResponse(access_token="", user=to_user_public(user))


@router.post(
    "/verify-email",
    response_model=TokenResponse,
    summary="Подтверждение email",
)
async def verify_email(
    body: VerifyEmailRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    service = AuthService(db)
    user = await service.verify_email(body.token)
    return TokenResponse(access_token="", user=to_user_public(user))


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Вход",
)
async def login(
    request: Request,
    body: LoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    user_agent = request.headers.get("user-agent")
    client = request.client
    ip = client.host if client else None

    settings = get_settings()
    await enforce_rate_limit(
        scope="login",
        ip=ip or "unknown",
        identity=body.email,
        limit=settings.rate_limit_login,
        window_seconds=settings.rate_limit_window_seconds,
    )

    service = AuthService(db)
    user, access, refresh_raw, expires_at = await service.login(
        email=body.email,
        password=body.password,
        user_agent=user_agent,
        ip=ip,
    )
    _set_refresh_cookie(response, refresh_raw, expires_at)
    return TokenResponse(access_token=access, user=to_user_public(user))


@router.post(
    "/refresh",
    response_model=RefreshResponse,
    summary="Обновление токена",
)
async def refresh(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    refresh_token: str | None = Cookie(default=None, alias="remora_refresh"),
) -> RefreshResponse:
    if refresh_token is None:
        raise UnauthorizedError("Отсутствует refresh-токен")

    user_agent = request.headers.get("user-agent")
    client = request.client
    ip = client.host if client else None

    service = AuthService(db)
    _user, access, new_refresh, expires_at = await service.refresh(
        refresh_token=refresh_token,
        user_agent=user_agent,
        ip=ip,
    )
    _set_refresh_cookie(response, new_refresh, expires_at)
    return RefreshResponse(access_token=access)


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Выход",
)
async def logout(
    response: Response,
    db: AsyncSession = Depends(get_db),
    refresh_token: str | None = Cookie(default=None, alias="remora_refresh"),
) -> None:
    if refresh_token is not None:
        service = AuthService(db)
        await service.logout(refresh_token)
    _clear_refresh_cookie(response)


@router.post(
    "/password-reset",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Запрос сброса пароля",
)
async def request_password_reset(
    request: Request,
    body: PasswordResetRequest,
    db: AsyncSession = Depends(get_db),
) -> None:
    settings = get_settings()
    await enforce_rate_limit(
        scope="password-reset",
        ip=request.client.host if request.client else "unknown",
        identity=body.email,
        limit=settings.rate_limit_password_reset,
        window_seconds=settings.rate_limit_password_reset_window_seconds,
    )
    service = AuthService(db)
    await service.request_password_reset(body.email)


@router.post(
    "/password-reset/confirm",
    response_model=TokenResponse,
    summary="Сброс пароля",
)
async def confirm_password_reset(
    body: PasswordResetConfirmRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    service = AuthService(db)
    user = await service.confirm_password_reset(body.token, body.new_password)
    return TokenResponse(access_token="", user=to_user_public(user))


@router.get(
    "/me",
    response_model=UserPublic,
    summary="Текущий пользователь",
)
async def get_me(user: User = Depends(current_user)) -> UserPublic:
    return to_user_public(user)
