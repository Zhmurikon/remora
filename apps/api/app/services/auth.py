"""Сервис аутентификации: регистрация, вход, ротация токенов, сброс пароля.

Слои не перепрыгивать: роутер вызывает сервис, сервис — репозитории.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from typing import Literal
from uuid import UUID, uuid4

import structlog
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.email import send_password_reset_email, send_verification_email
from app.core.errors import ConflictError, UnauthorizedError
from app.core.passwords import validate_password
from app.core.security import (
    create_jwt,
    decode_jwt,
    generate_refresh_token,
    hash_password,
    hash_token,
    verify_password,
)
from app.models.user import User, UserStatus
from app.repositories import action_token as action_token_repo
from app.repositories import token as token_repo
from app.repositories import user as user_repo
from app.schemas.auth import UserPublic

log = structlog.get_logger()

EMAIL_VERIFICATION: Literal["email_verification"] = "email_verification"
PASSWORD_RESET: Literal["password_reset"] = "password_reset"


class AuthService:
    """Бизнес-логика аутентификации. Без состояния — всё в БД."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def register(
        self,
        *,
        email: str,
        password: str,
        username: str,
        birth_date: date | None = None,
    ) -> tuple[User, str]:
        """Создаёт пользователя, возвращает (user, verification_token)."""
        # Проверка пароля по словарю и политике
        err = validate_password(password)
        if err:
            raise ConflictError(err)

        # Уникальность email и username
        if await user_repo.get_user_by_email(self.db, email):
            raise ConflictError("Пользователь с таким email уже существует")
        if await user_repo.get_user_by_username(self.db, username):
            raise ConflictError("Это имя пользователя занято")

        pw_hash = hash_password(password)
        try:
            user = await user_repo.create_user(
                self.db,
                email=email,
                password_hash=pw_hash,
                username=username,
                birth_date=birth_date,
            )
        except IntegrityError as exc:
            # Предварительные SELECT не защищают от двух одновременных INSERT.
            await self.db.rollback()
            raise ConflictError("Email или имя пользователя уже заняты") from exc

        settings = get_settings()
        token = create_jwt(str(user.id), EMAIL_VERIFICATION, extra={"email": email})
        await action_token_repo.create_token(
            self.db,
            user_id=user.id,
            token_hash=hash_token(token),
            purpose=EMAIL_VERIFICATION,
            expires_at=datetime.now(tz=UTC)
            + timedelta(hours=settings.email_verification_ttl_hours),
        )
        await send_verification_email(email, token)
        log.info("auth.register", user_id=str(user.id), email=email)
        return user, token

    async def verify_email(self, token: str) -> User:
        payload = decode_jwt(token, "email_verification")
        if payload is None:
            raise UnauthorizedError("Недействительная или истекшая ссылка")

        user_id = UUID(payload["sub"])
        consumed = await action_token_repo.consume_token(
            self.db,
            token_hash=hash_token(token),
            purpose=EMAIL_VERIFICATION,
            user_id=user_id,
        )
        if not consumed:
            raise UnauthorizedError("Ссылка уже использована или недействительна")

        user = await user_repo.get_user_by_id(self.db, user_id)
        if user is None or payload.get("email") != user.email:
            raise UnauthorizedError("Пользователь не найден")

        await user_repo.verify_email(self.db, user_id)
        log.info("auth.email_verified", user_id=str(user_id))
        return user

    async def login(
        self,
        *,
        email: str,
        password: str,
        user_agent: str | None = None,
        ip: str | None = None,
    ) -> tuple[User, str, str, datetime]:
        """Проверяет пароль, создаёт refresh-токен, возвращает access + refresh."""
        user = await user_repo.get_user_by_email(self.db, email)
        if user is None or user.password_hash is None:
            raise UnauthorizedError("Неверный email или пароль")

        if not verify_password(password, user.password_hash):
            raise UnauthorizedError("Неверный email или пароль")

        if user.status != UserStatus.active:
            raise UnauthorizedError("Аккаунт недоступен")

        access_token = create_jwt(str(user.id), "access")
        raw_token, token_hash = generate_refresh_token()

        settings = get_settings()
        expires_at = datetime.now(tz=UTC) + timedelta(
            days=settings.refresh_token_ttl_days
        )

        await token_repo.create_token(
            self.db,
            user_id=user.id,
            token_hash=token_hash,
            family_id=uuid4(),
            expires_at=expires_at,
            user_agent=user_agent,
            ip=ip,
        )
        # family_id генерируется моделью (default=uuid4) при flush

        log.info("auth.login", user_id=str(user.id))
        return user, access_token, raw_token, expires_at

    async def refresh(
        self,
        *,
        refresh_token: str,
        user_agent: str | None = None,
        ip: str | None = None,
    ) -> tuple[User, str, str, datetime]:
        """Ротация refresh-токена. При повторном использовании — отзыв всей семьи."""
        token_hash = hash_token(refresh_token)
        stored = await token_repo.get_token_by_hash_for_update(self.db, token_hash)

        if stored is None:
            # Токен не найден — возможно, фальшивка или уже удалён.
            raise UnauthorizedError("Недействительный refresh-токен")

        now = datetime.now(tz=UTC)

        if stored.revoked_at is not None:
            # Попытка использовать ревойденный токен = кража.
            # Отзываем всю семью и коммитим до ошибки — иначе get_db
            # откатит отзыв и семья останется активной.
            await token_repo.revoke_family(self.db, stored.family_id)
            await self.db.commit()
            log.warning("auth.token_reuse", family_id=str(stored.family_id))
            raise UnauthorizedError("Refresh-токен отозван")

        if stored.expires_at <= now:
            await token_repo.revoke_token(self.db, stored.id)
            raise UnauthorizedError("Срок действия сессии истёк")

        # Ротация: ревойдим старый, создаём новый в той же семье
        await token_repo.revoke_token(self.db, stored.id)

        new_raw, new_hash = generate_refresh_token()
        settings = get_settings()
        expires_at = now + timedelta(days=settings.refresh_token_ttl_days)

        await token_repo.create_token(
            self.db,
            user_id=stored.user_id,
            token_hash=new_hash,
            family_id=stored.family_id,
            expires_at=expires_at,
            user_agent=user_agent,
            ip=ip,
        )

        user = await user_repo.get_user_by_id(self.db, stored.user_id)
        if user is None or user.status != UserStatus.active:
            raise UnauthorizedError("Аккаунт недоступен")

        access_token = create_jwt(str(user.id), "access")
        log.info("auth.refresh", user_id=str(user.id))
        return user, access_token, new_raw, expires_at

    async def logout(self, refresh_token: str) -> None:
        token_hash = hash_token(refresh_token)
        stored = await token_repo.get_token_by_hash(self.db, token_hash)
        if stored is not None and stored.revoked_at is None:
            await token_repo.revoke_token(self.db, stored.id)
            log.info("auth.logout", user_id=str(stored.user_id))

    async def request_password_reset(self, email: str) -> None:
        """Отправляет письмо сброса, если email существует.
        Молчание при отсутствии — чтобы не раскрывать регистрацию email.
        """
        user = await user_repo.get_user_by_email(self.db, email)
        if user is None:
            return

        settings = get_settings()
        token = create_jwt(str(user.id), PASSWORD_RESET, extra={"email": email})
        await action_token_repo.create_token(
            self.db,
            user_id=user.id,
            token_hash=hash_token(token),
            purpose=PASSWORD_RESET,
            expires_at=datetime.now(tz=UTC)
            + timedelta(minutes=settings.password_reset_ttl_minutes),
        )
        await send_password_reset_email(email, token)
        log.info("auth.password_reset_requested", user_id=str(user.id))

    async def confirm_password_reset(self, token: str, new_password: str) -> User:
        payload = decode_jwt(token, "password_reset")
        if payload is None:
            raise UnauthorizedError("Недействительная или истекшая ссылка")

        user_id = UUID(payload["sub"])
        consumed = await action_token_repo.consume_token(
            self.db,
            token_hash=hash_token(token),
            purpose=PASSWORD_RESET,
            user_id=user_id,
        )
        if not consumed:
            raise UnauthorizedError("Ссылка уже использована или недействительна")

        user = await user_repo.get_user_by_id(self.db, user_id)
        if user is None or payload.get("email") != user.email:
            raise UnauthorizedError("Пользователь не найден")

        err = validate_password(new_password)
        if err:
            raise ConflictError(err)

        pw_hash = hash_password(new_password)
        await user_repo.update_password(self.db, user_id, pw_hash)
        # Отзыв всех сессий после смены пароля
        await token_repo.revoke_all_user_tokens(self.db, user_id)
        await action_token_repo.consume_active_tokens(
            self.db, user_id=user_id, purpose=PASSWORD_RESET
        )
        log.info("auth.password_reset", user_id=str(user_id))
        return user


def to_user_public(user: User) -> UserPublic:
    return UserPublic(
        id=user.id,
        email=user.email,
        username=user.username,
        display_name=user.display_name,
        avatar_url=user.avatar_url,
        role=user.role.value,
        email_verified=user.email_verified_at is not None,
        birth_date=user.birth_date,
        locale=user.locale,
        timezone=user.timezone,
    )
