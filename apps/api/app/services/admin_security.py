"""Административный вход с TOTP, recovery-кодами и журналом действий."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Literal, Never
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import ForbiddenError, UnauthorizedError
from app.core.security import create_jwt, decode_jwt, hash_token, verify_password
from app.core.totp import (
    decrypt_totp_secret,
    encrypt_totp_secret,
    generate_recovery_codes,
    generate_totp_secret,
    hash_recovery_code,
    provisioning_uri,
    verify_totp,
)
from app.models.admin_security import AdminTotp
from app.models.user import User, UserRole, UserStatus
from app.repositories import action_token as action_token_repo
from app.repositories import admin_security as repo
from app.repositories import user as user_repo
from app.schemas.admin_security import (
    AdminAuditItem,
    AdminAuditList,
    AdminConfirmationResponse,
    AdminLoginStep,
    AdminSecurityStatus,
    AdminSetupResponse,
)
from app.services.auth import AuthService

SETUP_PURPOSE = "admin_2fa_setup"
CHALLENGE_PURPOSE = "admin_2fa_challenge"


@dataclass(frozen=True)
class AdminSession:
    user: User
    access_token: str
    refresh_token: str
    expires_at: datetime
    recovery_codes: list[str]


class AdminSecurityService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def begin_login(
        self,
        *,
        email: str,
        password: str,
        ip: str | None,
        user_agent: str | None,
    ) -> AdminLoginStep:
        user = await user_repo.get_user_by_email(self.db, email)
        valid = (
            user is not None
            and user.password_hash is not None
            and verify_password(password, user.password_hash)
            and user.status is UserStatus.active
            and user.role is UserRole.admin
        )
        if not valid:
            await repo.add_audit(
                self.db,
                actor_user_id=user.id if user is not None and user.role is UserRole.admin else None,
                action="admin.login.password",
                outcome="failure",
                ip=ip,
                user_agent=user_agent,
            )
            await self.db.commit()
            raise UnauthorizedError("Неверные данные администратора")
        assert user is not None

        totp = await repo.get_totp(self.db, user.id)
        if totp is not None and totp.enabled_at is not None:
            token = await self._issue_step_token(user.id, "admin_2fa_challenge", CHALLENGE_PURPOSE)
            step: Literal["setup_required", "challenge_required"] = "challenge_required"
        else:
            token = await self._issue_step_token(user.id, "admin_2fa_setup", SETUP_PURPOSE)
            step = "setup_required"
        await repo.add_audit(
            self.db,
            actor_user_id=user.id,
            action="admin.login.password",
            outcome="success",
            ip=ip,
            user_agent=user_agent,
            details={"next_step": step},
        )
        return AdminLoginStep(step=step, token=token)

    async def start_setup(
        self, token: str, *, ip: str | None, user_agent: str | None
    ) -> AdminSetupResponse:
        user = await self._step_user(token, "admin_2fa_setup", SETUP_PURPOSE)
        existing = await repo.get_totp(self.db, user.id)
        if existing is not None and existing.enabled_at is not None:
            raise ForbiddenError("Двухфакторная защита уже настроена")
        secret = generate_totp_secret()
        await repo.set_pending_totp(self.db, user.id, encrypt_totp_secret(secret))
        await repo.add_audit(
            self.db,
            actor_user_id=user.id,
            action="admin.2fa.setup_started",
            outcome="success",
            ip=ip,
            user_agent=user_agent,
        )
        return AdminSetupResponse(
            secret=secret,
            provisioning_uri=provisioning_uri(secret, user.email or user.username),
        )

    async def enable(
        self,
        token: str,
        code: str,
        *,
        ip: str | None,
        user_agent: str | None,
    ) -> AdminSession:
        user = await self._step_user(token, "admin_2fa_setup", SETUP_PURPOSE)
        record = await repo.get_totp(self.db, user.id, for_update=True)
        if record is None or record.enabled_at is not None:
            raise UnauthorizedError("Настройка 2FA не найдена или уже завершена")
        if not verify_totp(decrypt_totp_secret(record.secret_ciphertext), code):
            await self._failed_code(user.id, "admin.2fa.enable", ip, user_agent)
        consumed = await action_token_repo.consume_token(
            self.db,
            token_hash=hash_token(token),
            purpose=SETUP_PURPOSE,
            user_id=user.id,
        )
        if not consumed:
            raise UnauthorizedError("Ссылка настройки 2FA уже использована")
        recovery_codes = generate_recovery_codes()
        await repo.enable_totp(
            self.db, record, [hash_recovery_code(item) for item in recovery_codes]
        )
        session = await self._create_session(user, ip=ip, user_agent=user_agent)
        await repo.add_audit(
            self.db,
            actor_user_id=user.id,
            action="admin.2fa.enabled",
            outcome="success",
            ip=ip,
            user_agent=user_agent,
        )
        return AdminSession(
            user=session.user,
            access_token=session.access_token,
            refresh_token=session.refresh_token,
            expires_at=session.expires_at,
            recovery_codes=recovery_codes,
        )

    async def verify(
        self,
        token: str,
        code: str,
        *,
        ip: str | None,
        user_agent: str | None,
    ) -> AdminSession:
        user = await self._step_user(token, "admin_2fa_challenge", CHALLENGE_PURPOSE)
        record = await repo.get_totp(self.db, user.id, for_update=True)
        if record is None or record.enabled_at is None:
            raise UnauthorizedError("Двухфакторная защита не настроена")
        if not await self._verify_code(record, code):
            await self._failed_code(user.id, "admin.login.2fa", ip, user_agent)
        consumed = await action_token_repo.consume_token(
            self.db,
            token_hash=hash_token(token),
            purpose=CHALLENGE_PURPOSE,
            user_id=user.id,
        )
        if not consumed:
            raise UnauthorizedError("Проверка уже использована")
        session = await self._create_session(user, ip=ip, user_agent=user_agent)
        await repo.add_audit(
            self.db,
            actor_user_id=user.id,
            action="admin.login.2fa",
            outcome="success",
            ip=ip,
            user_agent=user_agent,
        )
        return session

    async def status(self, user: User) -> AdminSecurityStatus:
        record = await repo.get_totp(self.db, user.id)
        return AdminSecurityStatus(
            enabled=record is not None and record.enabled_at is not None,
            enabled_at=record.enabled_at if record else None,
            last_used_at=record.last_used_at if record else None,
            recovery_codes_remaining=len(record.recovery_code_hashes) if record else 0,
        )

    async def confirm(
        self,
        user: User,
        code: str,
        *,
        ip: str | None,
        user_agent: str | None,
    ) -> AdminConfirmationResponse:
        record = await repo.get_totp(self.db, user.id, for_update=True)
        if record is None or record.enabled_at is None or not await self._verify_code(record, code):
            await self._failed_code(user.id, "admin.confirmation", ip, user_agent)
        settings = get_settings()
        expires_at = datetime.now(UTC) + timedelta(minutes=settings.admin_confirmation_ttl_minutes)
        token = create_jwt(str(user.id), "admin_confirmation")
        await repo.add_audit(
            self.db,
            actor_user_id=user.id,
            action="admin.confirmation",
            outcome="success",
            ip=ip,
            user_agent=user_agent,
        )
        return AdminConfirmationResponse(confirmation_token=token, expires_at=expires_at)

    async def audit(self, *, offset: int, limit: int) -> AdminAuditList:
        records, total = await repo.list_audit(self.db, offset=offset, limit=limit)
        return AdminAuditList(
            items=[
                AdminAuditItem(
                    id=item.id,
                    actor_user_id=item.actor_user_id,
                    actor_username=username,
                    action=item.action,
                    outcome=item.outcome,
                    target_type=item.target_type,
                    target_id=item.target_id,
                    reason=item.reason,
                    idempotency_key=item.idempotency_key,
                    ip=item.ip,
                    details=item.details,
                    created_at=item.created_at,
                )
                for item, username in records
            ],
            total=total,
            offset=offset,
            limit=limit,
        )

    async def _issue_step_token(
        self,
        user_id: UUID,
        token_type: Literal["admin_2fa_setup", "admin_2fa_challenge"],
        purpose: str,
    ) -> str:
        token = create_jwt(str(user_id), token_type)
        await action_token_repo.create_token(
            self.db,
            user_id=user_id,
            token_hash=hash_token(token),
            purpose=purpose,
            expires_at=datetime.now(UTC)
            + timedelta(minutes=get_settings().admin_2fa_challenge_ttl_minutes),
        )
        return token

    async def _step_user(
        self,
        token: str,
        token_type: Literal["admin_2fa_setup", "admin_2fa_challenge"],
        purpose: str,
    ) -> User:
        payload = decode_jwt(token, token_type)
        if payload is None:
            raise UnauthorizedError("Проверка администратора истекла")
        user_id = UUID(payload["sub"])
        active = await action_token_repo.is_token_active(
            self.db,
            token_hash=hash_token(token),
            purpose=purpose,
            user_id=user_id,
        )
        user = await user_repo.get_user_by_id(self.db, user_id)
        if (
            not active
            or user is None
            or user.status is not UserStatus.active
            or user.role is not UserRole.admin
        ):
            raise UnauthorizedError("Проверка администратора недействительна")
        return user

    async def _verify_code(self, record: AdminTotp, code: str) -> bool:
        if verify_totp(decrypt_totp_secret(record.secret_ciphertext), code):
            await repo.touch_totp(self.db, record)
            return True
        return await repo.consume_recovery_hash(self.db, record, hash_recovery_code(code))

    async def _create_session(
        self, user: User, *, ip: str | None, user_agent: str | None
    ) -> AdminSession:
        access, refresh, expires_at = await AuthService(self.db).create_admin_session(
            user,
            user_agent=user_agent,
            ip=ip,
        )
        return AdminSession(
            user=user,
            access_token=access,
            refresh_token=refresh,
            expires_at=expires_at,
            recovery_codes=[],
        )

    async def _failed_code(
        self, user_id: UUID, action: str, ip: str | None, user_agent: str | None
    ) -> Never:
        await repo.add_audit(
            self.db,
            actor_user_id=user_id,
            action=action,
            outcome="failure",
            ip=ip,
            user_agent=user_agent,
        )
        await self.db.commit()
        raise UnauthorizedError("Неверный код подтверждения")


def verify_admin_confirmation(token: str, user: User) -> bool:
    payload = decode_jwt(token, "admin_confirmation")
    return payload is not None and payload["sub"] == str(user.id)
