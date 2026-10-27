"""Хранение 2FA и журнала административных действий."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, cast
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.admin_security import AdminAuditLog, AdminTotp
from app.models.user import User


async def get_totp(
    db: AsyncSession, user_id: UUID, *, for_update: bool = False
) -> AdminTotp | None:
    query = select(AdminTotp).where(AdminTotp.user_id == user_id)
    if for_update:
        query = query.with_for_update()
    return cast(AdminTotp | None, await db.scalar(query))


async def set_pending_totp(db: AsyncSession, user_id: UUID, secret_ciphertext: str) -> AdminTotp:
    record = await get_totp(db, user_id, for_update=True)
    if record is None:
        record = AdminTotp(user_id=user_id, secret_ciphertext=secret_ciphertext)
        db.add(record)
    else:
        record.secret_ciphertext = secret_ciphertext
        record.recovery_code_hashes = []
        record.enabled_at = None
    await db.flush()
    return record


async def enable_totp(db: AsyncSession, record: AdminTotp, recovery_hashes: list[str]) -> None:
    now = datetime.now(UTC)
    record.recovery_code_hashes = recovery_hashes
    record.enabled_at = now
    record.last_used_at = now
    await db.flush()


async def touch_totp(db: AsyncSession, record: AdminTotp) -> None:
    record.last_used_at = datetime.now(UTC)
    await db.flush()


async def consume_recovery_hash(db: AsyncSession, record: AdminTotp, value: str) -> bool:
    locked = await get_totp(db, record.user_id, for_update=True)
    if locked is None or value not in locked.recovery_code_hashes:
        return False
    locked.recovery_code_hashes = [item for item in locked.recovery_code_hashes if item != value]
    locked.last_used_at = datetime.now(UTC)
    await db.flush()
    return True


async def add_audit(
    db: AsyncSession,
    *,
    actor_user_id: UUID | None,
    action: str,
    outcome: str,
    ip: str | None,
    user_agent: str | None,
    target_type: str | None = None,
    target_id: UUID | None = None,
    reason: str | None = None,
    details: dict[str, Any] | None = None,
) -> AdminAuditLog:
    item = AdminAuditLog(
        actor_user_id=actor_user_id,
        action=action,
        outcome=outcome,
        ip=ip,
        user_agent=user_agent,
        target_type=target_type,
        target_id=target_id,
        reason=reason,
        details=details or {},
    )
    db.add(item)
    await db.flush()
    return item


async def list_audit(
    db: AsyncSession, *, offset: int, limit: int
) -> tuple[list[tuple[AdminAuditLog, str | None]], int]:
    total = int((await db.scalar(select(func.count(AdminAuditLog.id)))) or 0)
    rows = (
        await db.execute(
            select(AdminAuditLog, User.username)
            .outerjoin(User, User.id == AdminAuditLog.actor_user_id)
            .order_by(AdminAuditLog.created_at.desc(), AdminAuditLog.id.desc())
            .offset(offset)
            .limit(limit)
        )
    ).all()
    return [(row[0], row[1]) for row in rows], total
