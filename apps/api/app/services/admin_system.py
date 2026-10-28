"""Операционная диагностика, фиче-флаги и журнал инцидентов."""

import asyncio
import hashlib
import json
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

import httpx
import redis.asyncio as redis
from aiosmtplib import SMTP
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import ConflictError, NotFoundError
from app.core.storage import get_object_storage
from app.models.admin_operations import AdminIncident, FeatureFlag
from app.models.user import User
from app.repositories import admin_security as security_repo
from app.repositories import admin_system as repo
from app.schemas.admin_system import (
    AdminFeatureFlagItem,
    AdminFeatureFlagWrite,
    AdminIncidentCreate,
    AdminIncidentItem,
    AdminIncidentUpdate,
    AdminMonitoringLink,
    AdminSystemCheck,
    AdminSystemOverview,
)


class AdminSystemService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def overview(self) -> AdminSystemOverview:
        checked_at = datetime.now(UTC)
        checks = await self.checks(checked_at)
        return AdminSystemOverview(
            checks=checks,
            flags=await self._flags(),
            incidents=await self._incidents(),
            monitoring_links=[
                AdminMonitoringLink(label=label, url=url)
                for label, url in sorted(get_settings().admin_monitoring_links.items())
                if url.startswith(("https://", "http://"))
            ],
            checked_at=checked_at,
        )

    async def checks(self, checked_at: datetime) -> list[AdminSystemCheck]:
        settings = get_settings()
        checks: list[AdminSystemCheck] = []
        checks.append(
            await self._probe("postgres", "PostgreSQL", "Основа", self._postgres, checked_at)
        )
        checks.append(await self._probe("redis", "Redis", "Основа", self._redis, checked_at))
        checks.append(
            await self._probe("meilisearch", "Meilisearch", "Основа", self._meili, checked_at)
        )
        checks.append(await self._probe("minio", "MinIO / S3", "Основа", self._storage, checked_at))
        checks.append(await self._worker(checked_at))
        checks.append(await self._probe("email", "Почта", "Интеграции", self._smtp, checked_at))

        oauth_configured = bool(
            settings.google_oauth_client_id and settings.google_oauth_client_secret
        )
        checks.append(
            self._configured(
                "oauth",
                "Google OAuth",
                oauth_configured,
                "Интеграции",
                checked_at,
            )
        )
        if settings.tts_provider == "disabled":
            checks.append(
                AdminSystemCheck(
                    key="tts",
                    label="Синтез речи",
                    group="Интеграции",
                    state="disabled",
                    detail="Отключён конфигурацией",
                    checked_at=checked_at,
                )
            )
        else:
            tts_configured = bool(
                settings.yandex_speechkit_api_key and settings.yandex_speechkit_folder_id
            )
            checks.append(
                self._configured("tts", "Синтез речи", tts_configured, "Интеграции", checked_at)
            )
        for platform, label, secret in (
            ("telegram", "Telegram-бот", settings.bot_tg_service_token),
            ("vk", "VK-бот", settings.bot_vk_service_token),
        ):
            configured = bool(secret.get_secret_value())
            failed = await repo.failed_bot_events(self.db, platform)
            if not configured:
                state = "disabled"
                detail = "Не настроен"
            elif failed:
                state = "degraded"
                detail = f"Ошибок доставки в журнале: {failed}"
            else:
                state = "ok"
                detail = "Настроен, ошибок доставки нет"
            checks.append(
                AdminSystemCheck(
                    key=f"bot_{platform}",
                    label=label,
                    group="Боты",
                    state=state,
                    detail=detail,
                    checked_at=checked_at,
                )
            )
        return checks

    async def write_flag(
        self,
        *,
        actor: User,
        body: AdminFeatureFlagWrite,
        idempotency_key: str,
        ip: str | None,
        user_agent: str | None,
    ) -> AdminFeatureFlagItem:
        payload = body.model_dump(mode="json")
        existing_audit = await self._repeated(
            actor, "admin.system.flag_saved", payload, idempotency_key
        )
        if existing_audit is not None:
            return await self._flag(existing_audit.target_id)
        flag = await repo.flag_for_update(self.db, body.key, body.environment)
        if flag is None:
            flag = FeatureFlag(
                key=body.key,
                environment=body.environment,
                description=body.description,
                enabled=body.enabled,
                owner=body.owner,
                expires_at=body.expires_at,
                updated_by=actor.id,
            )
            self.db.add(flag)
            await self.db.flush()
        else:
            flag.description = body.description
            flag.enabled = body.enabled
            flag.owner = body.owner
            flag.expires_at = body.expires_at
            flag.updated_by = actor.id
        await self._audit(
            actor=actor,
            action="admin.system.flag_saved",
            target_type="feature_flag",
            target_id=flag.id,
            reason=body.reason,
            idempotency_key=idempotency_key,
            ip=ip,
            user_agent=user_agent,
            payload=payload,
            details={"key": flag.key, "environment": flag.environment, "enabled": flag.enabled},
        )
        await self.db.refresh(flag)
        return self._flag_item(flag, actor.username)

    async def create_incident(
        self,
        *,
        actor: User,
        body: AdminIncidentCreate,
        idempotency_key: str,
        ip: str | None,
        user_agent: str | None,
    ) -> AdminIncidentItem:
        payload = body.model_dump(mode="json")
        existing_audit = await self._repeated(
            actor, "admin.system.incident_created", payload, idempotency_key
        )
        if existing_audit is not None:
            return await self._incident(existing_audit.target_id)
        incident = AdminIncident(
            title=body.title,
            summary=body.summary,
            severity=body.severity,
            status="open",
            external_url=str(body.external_url) if body.external_url else None,
            started_at=body.started_at,
            created_by=actor.id,
            updated_by=actor.id,
        )
        self.db.add(incident)
        await self.db.flush()
        await self._audit(
            actor=actor,
            action="admin.system.incident_created",
            target_type="incident",
            target_id=incident.id,
            reason=body.reason,
            idempotency_key=idempotency_key,
            ip=ip,
            user_agent=user_agent,
            payload=payload,
            details={"severity": incident.severity, "status": incident.status},
        )
        await self.db.refresh(incident)
        return self._incident_item(incident, actor.username)

    async def update_incident(
        self,
        *,
        actor: User,
        incident_id: UUID,
        body: AdminIncidentUpdate,
        idempotency_key: str,
        ip: str | None,
        user_agent: str | None,
    ) -> AdminIncidentItem:
        payload = body.model_dump(mode="json") | {"incident_id": str(incident_id)}
        existing_audit = await self._repeated(
            actor, "admin.system.incident_updated", payload, idempotency_key
        )
        if existing_audit is not None:
            return await self._incident(incident_id)
        incident = await repo.incident_for_update(self.db, incident_id)
        if incident is None:
            raise NotFoundError("Инцидент не найден")
        incident.summary = body.summary
        incident.severity = body.severity
        incident.status = body.status
        incident.external_url = str(body.external_url) if body.external_url else None
        incident.resolved_at = datetime.now(UTC) if body.status == "resolved" else None
        incident.updated_by = actor.id
        await self._audit(
            actor=actor,
            action="admin.system.incident_updated",
            target_type="incident",
            target_id=incident.id,
            reason=body.reason,
            idempotency_key=idempotency_key,
            ip=ip,
            user_agent=user_agent,
            payload=payload,
            details={"severity": incident.severity, "status": incident.status},
        )
        await self.db.refresh(incident)
        return self._incident_item(incident, actor.username)

    async def _flags(self) -> list[AdminFeatureFlagItem]:
        return [self._flag_item(flag, username) for flag, username in await repo.flags(self.db)]

    async def _flag(self, flag_id: UUID | None) -> AdminFeatureFlagItem:
        if flag_id is None:
            raise NotFoundError("Фиче-флаг не найден")
        for flag, username in await repo.flags(self.db):
            if flag.id == flag_id:
                return self._flag_item(flag, username)
        raise NotFoundError("Фиче-флаг не найден")

    async def _incidents(self) -> list[AdminIncidentItem]:
        return [
            self._incident_item(incident, username)
            for incident, username in await repo.incidents(self.db)
        ]

    async def _incident(self, incident_id: UUID | None) -> AdminIncidentItem:
        if incident_id is None:
            raise NotFoundError("Инцидент не найден")
        for incident, username in await repo.incidents(self.db):
            if incident.id == incident_id:
                return self._incident_item(incident, username)
        raise NotFoundError("Инцидент не найден")

    @staticmethod
    def _flag_item(flag: FeatureFlag, username: str | None) -> AdminFeatureFlagItem:
        effective = flag.enabled and (
            flag.expires_at is None or flag.expires_at > datetime.now(UTC)
        )
        return AdminFeatureFlagItem(
            id=flag.id,
            key=flag.key,
            description=flag.description,
            enabled=flag.enabled,
            effective=effective,
            environment=flag.environment,
            owner=flag.owner,
            expires_at=flag.expires_at,
            updated_at=flag.updated_at,
            updated_by=username,
        )

    @staticmethod
    def _incident_item(incident: AdminIncident, username: str | None) -> AdminIncidentItem:
        return AdminIncidentItem(
            id=incident.id,
            title=incident.title,
            summary=incident.summary,
            severity=incident.severity,
            status=incident.status,
            external_url=incident.external_url,
            started_at=incident.started_at,
            resolved_at=incident.resolved_at,
            created_at=incident.created_at,
            updated_at=incident.updated_at,
            updated_by=username,
        )

    async def _postgres(self) -> str:
        await self.db.execute(text("SELECT 1"))
        return "Подключение установлено"

    async def _redis(self) -> str:
        client = redis.from_url(  # type: ignore[no-untyped-call]
            str(get_settings().redis_url), decode_responses=True
        )
        try:
            await client.ping()
            return "Подключение установлено"
        finally:
            await client.aclose()

    async def _meili(self) -> str:
        settings = get_settings()
        async with httpx.AsyncClient(
            base_url=settings.meili_url,
            timeout=3,
            trust_env=False,
        ) as client:
            response = await client.get("/health")
            response.raise_for_status()
        return "Сервис отвечает"

    async def _storage(self) -> str:
        await get_object_storage().health()
        return "Бакет доступен"

    async def _smtp(self) -> str:
        settings = get_settings()
        smtp = SMTP(
            hostname=settings.smtp_host,
            port=settings.smtp_port,
            start_tls=settings.smtp_start_tls,
        )
        try:
            await smtp.connect(timeout=3)
            return "SMTP отвечает"
        finally:
            if smtp.is_connected:
                await smtp.quit()

    async def _worker(self, checked_at: datetime) -> AdminSystemCheck:
        client = redis.from_url(  # type: ignore[no-untyped-call]
            str(get_settings().redis_url), decode_responses=True
        )
        try:
            health = await client.get("arq:queue:health-check")
        except Exception:  # noqa: BLE001 — диагностика не должна падать вместе с Redis
            health = None
        finally:
            await client.aclose()
        return AdminSystemCheck(
            key="worker",
            label="Worker",
            group="Основа",
            state="ok" if health else "degraded",
            detail="Heartbeat получен" if health else "Heartbeat worker не найден",
            checked_at=checked_at,
        )

    async def _probe(
        self,
        key: str,
        label: str,
        group: str,
        probe: Any,
        checked_at: datetime,
    ) -> AdminSystemCheck:
        try:
            async with asyncio.timeout(4):
                detail = await probe()
            state = "ok"
        except Exception:  # noqa: BLE001 — граница диагностики внешнего сервиса
            detail = "Проверка не пройдена"
            state = "degraded"
        return AdminSystemCheck(
            key=key,
            label=label,
            group=group,
            state=state,
            detail=detail,
            checked_at=checked_at,
        )

    @staticmethod
    def _configured(
        key: str, label: str, configured: bool, group: str, checked_at: datetime
    ) -> AdminSystemCheck:
        return AdminSystemCheck(
            key=key,
            label=label,
            group=group,
            state="ok" if configured else "disabled",
            detail="Настроен" if configured else "Не настроен",
            checked_at=checked_at,
        )

    async def _audit(
        self,
        *,
        actor: User,
        action: str,
        target_type: str,
        target_id: UUID,
        reason: str,
        idempotency_key: str,
        ip: str | None,
        user_agent: str | None,
        payload: dict[str, Any],
        details: dict[str, object],
    ) -> None:
        await security_repo.add_audit(
            self.db,
            actor_user_id=actor.id,
            action=action,
            outcome="success",
            target_type=target_type,
            target_id=target_id,
            reason=reason,
            idempotency_key=idempotency_key,
            ip=ip,
            user_agent=user_agent,
            details={"request_hash": self._request_hash(payload), **details},
        )

    async def _repeated(
        self, actor: User, action: str, payload: dict[str, Any], idempotency_key: str
    ) -> Any | None:
        existing = await security_repo.get_audit_by_idempotency(self.db, idempotency_key)
        if existing is None:
            return None
        if (
            existing.actor_user_id != actor.id
            or existing.action != action
            or existing.details.get("request_hash") != self._request_hash(payload)
        ):
            raise ConflictError("Ключ идемпотентности уже использован для другого действия")
        return existing

    @staticmethod
    def _request_hash(payload: dict[str, Any]) -> str:
        encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
        return hashlib.sha256(encoded.encode()).hexdigest()
