"""Зависимости FastAPI для аутентификации.

`current_user` — защищает эндпоинты: извлекает access JWT,
находит пользователя. Бросает UnauthorizedError при отсутствии.
"""

from __future__ import annotations

from ipaddress import ip_address
from uuid import UUID

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import ForbiddenError, UnauthorizedError
from app.core.rate_limit import enforce_rate_limit
from app.core.security import decode_jwt
from app.db.session import get_db
from app.models.user import User, UserRole, UserStatus
from app.repositories import user as user_repo

_bearer = HTTPBearer(auto_error=False)


async def current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> User:
    if creds is None or creds.scheme.lower() != "bearer":
        raise UnauthorizedError("Требуется вход")

    payload = decode_jwt(creds.credentials, "access")
    if payload is None:
        raise UnauthorizedError("Недействительный или истекший токен")

    user_id = UUID(payload["sub"])
    user = await user_repo.get_user_by_id(db, user_id)
    if user is None or user.status != UserStatus.active:
        raise UnauthorizedError("Аккаунт недоступен")

    return user


async def optional_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> User | None:
    """Возвращает активного пользователя, не требуя вход для публичного чтения."""
    if creds is None:
        return None
    return await current_user(request, db, creds)


async def moderator_user(user: User = Depends(current_user)) -> User:
    """Служебные операции постмодерации; полная панель модератора — задача E10."""
    if user.role not in (UserRole.moderator, UserRole.admin):
        raise ForbiddenError("Требуются права модератора")
    return user


def _is_internal(host: str | None) -> bool:
    """Публичные страницы рендерит Next и ходит в API по внутренней сети.

    У таких запросов нет адреса конечного посетителя: ограничивать их по IP означало бы
    считать всех читателей сайта одним клиентом. Поэтому лимит применяется только
    к обращениям с внешним адресом — прямым запросам к `/api/v1` мимо фронтенда.
    Ограничение самих страниц сайта живёт на gateway, см. TODO.md.
    """
    if not host:
        return True
    try:
        address = ip_address(host)
    except ValueError:
        return True
    return address.is_private or address.is_loopback or address.is_link_local


async def public_read_limit(request: Request) -> None:
    """Защита публичного чтения от выкачивания каталога напрямую через API."""
    host = request.client.host if request.client else None
    if _is_internal(host):
        return
    settings = get_settings()
    await enforce_rate_limit(
        scope="public-read",
        ip=host or "unknown",
        identity="",
        limit=settings.rate_limit_public_read,
        window_seconds=settings.rate_limit_public_read_window_seconds,
    )
