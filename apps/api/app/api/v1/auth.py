"""Роутер аутентификации.

Эндпоинты:
- POST /auth/register    — регистрация по email+пароль
- POST /auth/verify-email — подтверждение email
- POST /auth/login       — вход
- POST /auth/refresh      — ротация refresh-токена (cookie или тело/заголовок)
- POST /auth/logout       — отзыв сессии
- POST /auth/password-reset      — запрос сброса пароля
- POST /auth/password-reset/confirm — сброс пароля
- GET  /auth/oauth/google/start    — начало входа через Google
- GET  /auth/oauth/google/callback — callback Google OpenID Connect
- GET  /auth/me           — текущий пользователь

Мобильный клиент (X-Client: mobile) получает refresh-токен в теле ответа;
веб-клиент получает его через httpOnly-cookie. Ротация и детекция
переиспользования семьи токенов одинаковы для обоих клиентов.
"""

from __future__ import annotations

import hmac
from datetime import UTC, datetime
from urllib.parse import urlencode, urljoin, urlsplit
from uuid import UUID, uuid4

import structlog
from fastapi import APIRouter, Depends, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import current_user
from app.core.config import get_settings
from app.core.errors import AppError, UnauthorizedError
from app.core.rate_limit import enforce_rate_limit
from app.core.security import create_jwt, decode_jwt
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import (
    LoginRequest,
    PasswordChangeRequest,
    PasswordResetConfirmRequest,
    PasswordResetRequest,
    ProfileUpdateRequest,
    RefreshRequest,
    RefreshResponse,
    RegisterRequest,
    SessionPublic,
    TokenResponse,
    UserPublic,
    VerifyEmailRequest,
)
from app.services import google_oauth
from app.services.auth import AuthService, to_user_public

router = APIRouter(prefix="/auth", tags=["auth"])
log = structlog.get_logger()


def _is_mobile_client(request: Request) -> bool:
    """Признак мобильного клиента: заголовок X-Client: mobile."""
    return request.headers.get("x-client", "").lower() == "mobile"


def _get_refresh_token(request: Request, body_token: str | None = None) -> str | None:
    """Извлекает refresh-токен: cookie → заголовок X-Refresh-Token → тело."""
    cookie_token = request.cookies.get(get_settings().refresh_cookie_name)
    if cookie_token:
        return cookie_token
    header_token = request.headers.get("x-refresh-token")
    if header_token:
        return header_token
    return body_token


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


def _safe_oauth_next(candidate: str | None) -> str:
    settings = get_settings()
    if not candidate:
        return settings.app_url
    target = urljoin(settings.app_url, candidate)
    parsed = urlsplit(target)
    allowed_origins = {
        (urlsplit(settings.web_url).scheme, urlsplit(settings.web_url).netloc),
        (urlsplit(settings.app_url).scheme, urlsplit(settings.app_url).netloc),
    }
    if (
        parsed.scheme not in {"http", "https"}
        or (parsed.scheme, parsed.netloc) not in allowed_origins
    ):
        return settings.app_url
    return target


def _set_oauth_state_cookie(response: Response, token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        key=settings.oauth_state_cookie_name,
        value=token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        domain=settings.cookie_domain,
        max_age=settings.oauth_state_ttl_minutes * 60,
        path="/api/v1/auth/oauth/google/callback",
    )


def _clear_oauth_state_cookie(response: Response) -> None:
    settings = get_settings()
    response.delete_cookie(
        key=settings.oauth_state_cookie_name,
        domain=settings.cookie_domain,
        path="/api/v1/auth/oauth/google/callback",
    )


def _oauth_error_redirect(code: str, next_url: str | None = None) -> RedirectResponse:
    settings = get_settings()
    query: dict[str, str] = {"oauth_error": code}
    if next_url:
        query["next"] = next_url
    response = RedirectResponse(
        url=f"{settings.web_url.rstrip('/')}/login?{urlencode(query)}",
        status_code=status.HTTP_303_SEE_OTHER,
    )
    _clear_oauth_state_cookie(response)
    return response


@router.get(
    "/oauth/google/start",
    response_class=RedirectResponse,
    summary="Начать вход через Google",
)
async def google_oauth_start(next: str | None = None) -> RedirectResponse:
    target = _safe_oauth_next(next)
    nonce = str(uuid4())
    state_token = create_jwt(nonce, "oauth_state", extra={"next": target})
    try:
        authorization_url = google_oauth.build_authorization_url(nonce)
    except AppError:
        return _oauth_error_redirect("unavailable", target)
    response = RedirectResponse(
        url=authorization_url,
        status_code=status.HTTP_307_TEMPORARY_REDIRECT,
    )
    _set_oauth_state_cookie(response, state_token)
    return response


@router.get(
    "/oauth/google/callback",
    response_class=RedirectResponse,
    summary="Завершить вход через Google",
)
async def google_oauth_callback(
    request: Request,
    state: str | None = None,
    code: str | None = None,
    error: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> RedirectResponse:
    settings = get_settings()
    state_token = request.cookies.get(settings.oauth_state_cookie_name)
    payload = decode_jwt(state_token, "oauth_state") if state_token else None
    next_claim = payload.get("next") if payload else None
    target = _safe_oauth_next(next_claim if isinstance(next_claim, str) else None)

    if payload is None or state is None or not hmac.compare_digest(payload["sub"], state):
        return _oauth_error_redirect("invalid_state", target)
    if error is not None:
        return _oauth_error_redirect("denied", target)
    if code is None:
        return _oauth_error_redirect("invalid_state", target)

    ip = request.client.host if request.client else None
    try:
        await enforce_rate_limit(
            scope="oauth-login",
            ip=ip or "unknown",
            identity="google",
            limit=settings.rate_limit_login,
            window_seconds=settings.rate_limit_window_seconds,
        )
        profile = await google_oauth.exchange_code(code)
        _user, _access, refresh_raw, expires_at = await AuthService(db).login_with_google(
            profile,
            user_agent=request.headers.get("user-agent"),
            ip=ip,
        )
    except AppError as exc:
        log.warning("auth.oauth_failed", provider="google", reason=exc.code)
        oauth_error = exc.details.get("oauth_error")
        return _oauth_error_redirect(
            oauth_error if isinstance(oauth_error, str) else "failed",
            target,
        )

    redirect = RedirectResponse(url=target, status_code=status.HTTP_303_SEE_OTHER)
    _set_refresh_cookie(redirect, refresh_raw, expires_at)
    _clear_oauth_state_cookie(redirect)
    return redirect


@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Регистрация",
)
async def register(
    request: Request,
    body: RegisterRequest,
    response: Response,
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
    request: Request,
    body: VerifyEmailRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    service = AuthService(db)
    is_mobile = _is_mobile_client(request)
    user_agent = request.headers.get("user-agent")
    ip = request.client.host if request.client else None
    user, access, refresh_raw, expires_at = await service.verify_email(
        body.token,
        create_session=is_mobile,
        user_agent=user_agent,
        ip=ip,
    )
    _set_refresh_cookie(response, refresh_raw, expires_at)
    return TokenResponse(
        access_token=access,
        refresh_token=refresh_raw if is_mobile else None,
        user=to_user_public(user),
    )


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
    is_mobile = _is_mobile_client(request)

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
    return TokenResponse(
        access_token=access,
        refresh_token=refresh_raw if is_mobile else None,
        user=to_user_public(user),
    )


@router.post(
    "/refresh",
    response_model=RefreshResponse,
    summary="Обновление токена",
)
async def refresh(
    request: Request,
    response: Response,
    body: RefreshRequest | None = None,
    db: AsyncSession = Depends(get_db),
) -> RefreshResponse:
    body_token = body.refresh_token if body else None
    refresh_token = _get_refresh_token(request, body_token)
    if refresh_token is None:
        raise UnauthorizedError("Отсутствует refresh-токен")

    user_agent = request.headers.get("user-agent")
    client = request.client
    ip = client.host if client else None
    is_mobile = _is_mobile_client(request)

    service = AuthService(db)
    _user, access, new_refresh, expires_at = await service.refresh(
        refresh_token=refresh_token,
        user_agent=user_agent,
        ip=ip,
    )
    _set_refresh_cookie(response, new_refresh, expires_at)
    return RefreshResponse(
        access_token=access,
        refresh_token=new_refresh if is_mobile else None,
    )


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Выход",
)
async def logout(
    request: Request,
    response: Response,
    body: RefreshRequest | None = None,
    db: AsyncSession = Depends(get_db),
) -> None:
    body_token = body.refresh_token if body else None
    refresh_token = _get_refresh_token(request, body_token)
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


@router.patch("/me", response_model=UserPublic, summary="Обновление профиля")
async def update_me(
    body: ProfileUpdateRequest,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> UserPublic:
    updated = await AuthService(db).update_profile(user, **body.model_dump())
    return to_user_public(updated)


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT, summary="Смена пароля")
async def change_password(
    request: Request,
    body: PasswordChangeRequest,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    current_refresh = request.cookies.get(get_settings().refresh_cookie_name)
    await AuthService(db).change_password(
        user, body.current_password, body.new_password, current_refresh
    )


@router.get("/sessions", response_model=list[SessionPublic], summary="Активные сессии")
async def list_sessions(
    request: Request, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> list[SessionPublic]:
    current_refresh = request.cookies.get(get_settings().refresh_cookie_name)
    return await AuthService(db).list_sessions(user, current_refresh)


@router.delete(
    "/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Отзыв сессии"
)
async def revoke_session(
    session_id: UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> None:
    await AuthService(db).revoke_session(user, session_id)
