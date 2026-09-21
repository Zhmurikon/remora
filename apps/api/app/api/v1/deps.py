"""Зависимости FastAPI для аутентификации.

`current_user` — защищает эндпоинты: извлекает access JWT,
находит пользователя. Бросает UnauthorizedError при отсутствии.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ForbiddenError, UnauthorizedError
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
