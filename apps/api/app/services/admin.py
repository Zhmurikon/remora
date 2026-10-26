"""2FA и безопасные операции административной панели."""

from __future__ import annotations

import secrets
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.encryption import decrypt_secret, encrypt_secret
from app.core.errors import ConflictError, ForbiddenError, NotFoundError
from app.core.security import hash_token, verify_password
from app.core.totp import generate_totp_secret, provisioning_uri, verify_totp
from app.models.admin import AdminSecondFactor
from app.models.exports import AccountExportJob, AccountExportStatus
from app.models.imports import ImportJob, ImportJobStatus
from app.models.moderation import AuditLog, CourseReport, ReportStatus
from app.models.transcriptions import TranscriptionJob, TranscriptionStatus
from app.models.user import User, UserRole, UserStatus
from app.repositories import token as token_repo
from app.schemas.admin import AdminDashboard, AdminTaskItem, AdminUserItem


class AdminService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def factor(self, user_id: UUID, *, lock: bool = False) -> AdminSecondFactor | None:
        query = select(AdminSecondFactor).where(AdminSecondFactor.user_id == user_id)
        if lock:
            query = query.with_for_update()
        factor: AdminSecondFactor | None = await self.db.scalar(query)
        return factor

    async def setup(self, user: User, password: str) -> tuple[str, str]:
        if user.password_hash is None or not verify_password(password, user.password_hash):
            raise ForbiddenError("Неверный пароль")
        factor = await self.factor(user.id, lock=True)
        if factor is not None and factor.enabled_at is not None:
            raise ConflictError("Двухфакторная защита уже включена")
        secret = generate_totp_secret()
        encrypted = encrypt_secret(secret, context=f"admin-2fa:{user.id}")
        if factor is None:
            factor = AdminSecondFactor(user_id=user.id, secret_encrypted=encrypted)
            self.db.add(factor)
        else:
            factor.secret_encrypted = encrypted
            factor.recovery_hashes = []
            factor.last_totp_step = None
        await self.db.flush()
        return secret, provisioning_uri(secret, user.email or user.username)

    async def enable(self, user: User, code: str) -> list[str]:
        factor = await self.factor(user.id, lock=True)
        if factor is None:
            raise ConflictError("Сначала настройте второй фактор")
        if factor.enabled_at is not None:
            raise ConflictError("Двухфакторная защита уже включена")
        secret = decrypt_secret(factor.secret_encrypted, context=f"admin-2fa:{user.id}")
        step = verify_totp(secret, code)
        if step is None:
            raise ForbiddenError("Неверный одноразовый код")
        recovery = [f"rmr-{secrets.token_hex(5)}" for _ in range(10)]
        factor.recovery_hashes = [hash_token(item) for item in recovery]
        factor.enabled_at = datetime.now(UTC)
        factor.last_totp_step = step
        self.db.add(
            AuditLog(
                actor_id=user.id,
                event="admin.2fa_enabled",
                target_type="user",
                target_id=user.id,
                details={"recovery_codes": len(recovery)},
            )
        )
        await self.db.flush()
        return recovery

    async def verify(self, user: User, code: str | None) -> None:
        factor = await self.factor(user.id, lock=True)
        if factor is None or factor.enabled_at is None:
            raise ForbiddenError("Администратор должен включить двухфакторную защиту")
        if not code:
            raise ForbiddenError("Требуется одноразовый код администратора")
        digest = hash_token(code)
        if digest in factor.recovery_hashes:
            factor.recovery_hashes = [item for item in factor.recovery_hashes if item != digest]
            self.db.add(
                AuditLog(
                    actor_id=user.id,
                    event="admin.recovery_code_used",
                    target_type="user",
                    target_id=user.id,
                    details={"remaining": len(factor.recovery_hashes)},
                )
            )
            await self.db.flush()
            return
        secret = decrypt_secret(factor.secret_encrypted, context=f"admin-2fa:{user.id}")
        step = verify_totp(secret, code)
        if step is None or (factor.last_totp_step is not None and step <= factor.last_totp_step):
            raise ForbiddenError("Неверный или уже использованный одноразовый код")
        factor.last_totp_step = step
        await self.db.flush()

    async def dashboard(self) -> AdminDashboard:
        total, active, suspended = (
            await self.db.execute(
                select(
                    func.count(User.id),
                    func.count(User.id).filter(User.status == UserStatus.active),
                    func.count(User.id).filter(User.status == UserStatus.suspended),
                )
            )
        ).one()
        open_reports = await self.db.scalar(
            select(func.count(CourseReport.id)).where(
                CourseReport.status == ReportStatus.open.value
            )
        )
        export_jobs = await self.db.scalar(
            select(func.count(AccountExportJob.id)).where(
                AccountExportJob.status.in_(
                    [AccountExportStatus.queued, AccountExportStatus.processing]
                )
            )
        )
        import_jobs = await self.db.scalar(
            select(func.count(ImportJob.id)).where(
                ImportJob.status.in_([ImportJobStatus.queued, ImportJobStatus.processing])
            )
        )
        transcription_jobs = await self.db.scalar(
            select(func.count(TranscriptionJob.id)).where(
                TranscriptionJob.status.in_(
                    [
                        TranscriptionStatus.queued,
                        TranscriptionStatus.converting,
                        TranscriptionStatus.transcribing,
                    ]
                )
            )
        )
        return AdminDashboard(
            users_total=int(total),
            users_active=int(active),
            users_suspended=int(suspended),
            open_reports=int(open_reports or 0),
            queued_jobs=int(export_jobs or 0)
            + int(import_jobs or 0)
            + int(transcription_jobs or 0),
        )

    async def users(self, query: str, offset: int, limit: int) -> list[AdminUserItem]:
        statement = select(User).order_by(User.created_at.desc()).offset(offset).limit(limit)
        if query:
            pattern = f"%{query}%"
            statement = statement.where(
                or_(User.email.ilike(pattern), User.username.ilike(pattern))
            )
        rows = list((await self.db.scalars(statement)).all())
        return [self._user(item) for item in rows]

    async def update_user(
        self, actor: User, target_id: UUID, *, role: str | None, status: str | None, reason: str
    ) -> AdminUserItem:
        target = await self.db.scalar(select(User).where(User.id == target_id).with_for_update())
        if target is None:
            raise NotFoundError("Пользователь не найден")
        if target.id == actor.id and (
            role != UserRole.admin.value or status == UserStatus.suspended.value
        ):
            raise ForbiddenError("Нельзя лишить себя административного доступа")
        before = {"role": target.role.value, "status": target.status.value}
        if role is not None:
            target.role = UserRole(role)
        if status is not None:
            target.status = UserStatus(status)
            if target.status is UserStatus.suspended:
                await token_repo.revoke_all_user_tokens(self.db, target.id)
        self.db.add(
            AuditLog(
                actor_id=actor.id,
                event="admin.user_updated",
                target_type="user",
                target_id=target.id,
                details={
                    "before": before,
                    "after": {"role": target.role.value, "status": target.status.value},
                    "reason": reason,
                },
            )
        )
        await self.db.flush()
        return self._user(target)

    async def tasks(self, limit: int) -> list[AdminTaskItem]:
        exports = list(
            (
                await self.db.scalars(
                    select(AccountExportJob)
                    .order_by(AccountExportJob.created_at.desc())
                    .limit(limit)
                )
            ).all()
        )
        imports = list(
            (
                await self.db.scalars(
                    select(ImportJob).order_by(ImportJob.created_at.desc()).limit(limit)
                )
            ).all()
        )
        transcriptions = list(
            (
                await self.db.scalars(
                    select(TranscriptionJob)
                    .order_by(TranscriptionJob.created_at.desc())
                    .limit(limit)
                )
            ).all()
        )
        items = [
            *[
                AdminTaskItem(
                    id=item.id,
                    kind="account_export",
                    status=item.status.value,
                    user_id=item.user_id,
                    progress=item.progress,
                    created_at=item.created_at,
                    updated_at=item.updated_at,
                )
                for item in exports
            ],
            *[
                AdminTaskItem(
                    id=item.id,
                    kind="import",
                    status=item.status.value,
                    user_id=item.user_id,
                    progress=item.progress,
                    created_at=item.created_at,
                    updated_at=item.updated_at,
                )
                for item in imports
            ],
            *[
                AdminTaskItem(
                    id=item.id,
                    kind="transcription",
                    status=item.status.value,
                    user_id=None,
                    progress=(
                        int(item.uploaded_parts * 100 / item.total_parts)
                        if item.status is TranscriptionStatus.uploading and item.total_parts
                        else (100 if item.status is TranscriptionStatus.completed else 0)
                    ),
                    created_at=item.created_at,
                    updated_at=item.updated_at,
                )
                for item in transcriptions
            ],
        ]
        return sorted(items, key=lambda item: item.created_at, reverse=True)[:limit]

    @staticmethod
    def _user(user: User) -> AdminUserItem:
        return AdminUserItem(
            id=user.id,
            email=user.email,
            username=user.username,
            role=user.role.value,
            status=user.status.value,
            email_verified=user.email_verified_at is not None,
            created_at=user.created_at,
        )
