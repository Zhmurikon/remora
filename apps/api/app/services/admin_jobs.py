"""Просмотр и безопасный повтор фоновых операций."""

import hashlib
import json
from collections.abc import Mapping
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, NotFoundError
from app.core.queue import enqueue_account_export
from app.models.exports import AccountExportStatus
from app.models.user import User
from app.repositories import admin_jobs as repo
from app.repositories import admin_security as security_repo
from app.schemas.admin_jobs import AdminJobItem, AdminJobList

STALE_AFTER = timedelta(hours=3)


class AdminJobsService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def jobs(
        self, *, query: str | None, kind: str | None, status: str | None, offset: int, limit: int
    ) -> AdminJobList:
        rows, total = await repo.jobs(
            self.db, query=query, kind=kind, status=status, offset=offset, limit=limit
        )
        return AdminJobList(
            items=[self._item(row) for row in rows], total=total, offset=offset, limit=limit
        )

    async def retry(
        self,
        *,
        actor: User,
        kind: str,
        job_id: UUID,
        reason: str,
        idempotency_key: str,
        ip: str | None,
        user_agent: str | None,
    ) -> AdminJobItem:
        if kind not in {"export", "search"}:
            raise ConflictError("Эту операцию нельзя безопасно повторить без исходного файла")
        payload: dict[str, object] = {
            "kind": kind,
            "job_id": str(job_id),
            "reason": reason,
        }
        existing = await security_repo.get_audit_by_idempotency(self.db, idempotency_key)
        request_hash = self._request_hash(payload)
        if existing is not None:
            if (
                existing.actor_user_id != actor.id
                or existing.action != "admin.jobs.retried"
                or existing.target_id != job_id
                or existing.details.get("request_hash") != request_hash
            ):
                raise ConflictError("Ключ идемпотентности уже использован для другого действия")
            return await self._one(kind, job_id)

        if kind == "export":
            export_job = await repo.export_for_update(self.db, job_id)
            if export_job is None:
                raise NotFoundError("Фоновая операция не найдена")
            stale = self._stale(export_job.status.value, export_job.started_at)
            if export_job.status is not AccountExportStatus.failed and not stale:
                raise ConflictError("Повтор доступен только для ошибочного или зависшего экспорта")
            export_job.status = AccountExportStatus.queued
            export_job.progress = 0
            export_job.error_message = None
            export_job.started_at = None
            export_job.finished_at = None
            export_job.storage_key = None
            export_job.size_bytes = None
            export_job.expires_at = None
        else:
            search_job = await repo.search_for_update(self.db, job_id)
            if search_job is None:
                raise NotFoundError("Задача синхронизации не найдена")
            search_job.version += 1
            search_job.requested_at = datetime.now(UTC)

        await security_repo.add_audit(
            self.db,
            actor_user_id=actor.id,
            action="admin.jobs.retried",
            outcome="success",
            target_type=f"background_{kind}",
            target_id=job_id,
            reason=reason,
            idempotency_key=idempotency_key,
            ip=ip,
            user_agent=user_agent,
            details={"request_hash": request_hash, "kind": kind},
        )
        await self.db.commit()
        if kind == "export":
            try:
                await enqueue_account_export(str(job_id), attempt=uuid4().hex)
            except Exception as exc:
                failed = await repo.export_for_update(self.db, job_id)
                if failed is not None:
                    failed.status = AccountExportStatus.failed
                    failed.error_message = "Не удалось поставить экспорт в очередь"
                    failed.finished_at = datetime.now(UTC)
                    await self.db.commit()
                raise ConflictError("Очередь фоновых операций временно недоступна") from exc
        return await self._one(kind, job_id)

    async def _one(self, kind: str, job_id: UUID) -> AdminJobItem:
        result = await self.jobs(query=str(job_id), kind=kind, status=None, offset=0, limit=1)
        if not result.items:
            raise NotFoundError("Фоновая операция не найдена")
        return result.items[0]

    def _item(self, row: dict[str, Any]) -> AdminJobItem:
        status = str(row["status"])
        started_at = row["started_at"]
        stale = self._stale(status, started_at)
        retryable = row["kind"] == "search" or (
            row["kind"] == "export" and (status == "failed" or stale)
        )
        label = str(row["label"])
        if row["kind"] == "media":
            label = "Изображение" if label == "image" else "Аудио"
        error = row["error"]
        if row["kind"] == "media" and status == "rejected":
            error = "Файл отклонён при проверке"
        return AdminJobItem.model_validate(
            row
            | {
                "label": label,
                "error": error,
                "retryable": retryable,
                "stale": stale,
            }
        )

    @staticmethod
    def _stale(status: str, started_at: datetime | None) -> bool:
        return status in {"processing", "converting", "transcribing"} and (
            started_at is None or started_at < datetime.now(UTC) - STALE_AFTER
        )

    @staticmethod
    def _request_hash(payload: Mapping[str, object]) -> str:
        encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
        return hashlib.sha256(encoded.encode()).hexdigest()
