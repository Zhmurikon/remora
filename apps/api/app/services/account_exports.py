"""Создание архива со всеми пользовательскими данными Remora."""

import enum
import json
import mimetypes
from datetime import UTC, datetime, timedelta
from io import BytesIO
from typing import Any
from uuid import UUID
from zipfile import ZIP_DEFLATED, ZipFile

from sqlalchemy import inspect
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import ConflictError, ForbiddenError, NotFoundError
from app.core.storage import get_object_storage
from app.models.exports import AccountExportJob, AccountExportStatus
from app.models.user import User
from app.repositories import exports as export_repo
from app.schemas.exports import AccountExportPublic


class AccountExportService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create_job(self, user: User) -> AccountExportJob:
        latest = await export_repo.latest_job(self.db, user.id)
        if latest is not None and latest.status in {
            AccountExportStatus.queued,
            AccountExportStatus.processing,
        }:
            raise ConflictError("Экспорт аккаунта уже готовится")
        job = AccountExportJob(user_id=user.id)
        self.db.add(job)
        await self.db.flush()
        return job

    async def get_job(self, user: User, job_id: UUID) -> AccountExportJob:
        job = await export_repo.get_job(self.db, job_id)
        if job is None:
            raise NotFoundError("Задание экспорта не найдено")
        if job.user_id != user.id:
            raise ForbiddenError("Нет доступа к этому экспорту")
        return job

    async def latest_job(self, user: User) -> AccountExportJob | None:
        return await export_repo.latest_job(self.db, user.id)

    def public(self, job: AccountExportJob) -> AccountExportPublic:
        download_url = None
        now = datetime.now(UTC)
        if (
            job.status == AccountExportStatus.completed
            and job.storage_key is not None
            and job.expires_at is not None
            and job.expires_at > now
        ):
            ttl = max(1, int((job.expires_at - now).total_seconds()))
            download_url = get_object_storage().download_url(job.storage_key, ttl)
        return AccountExportPublic.model_validate(job).model_copy(
            update={"download_url": download_url}
        )

    async def build_archive(self, user: User) -> bytes:
        rows = await export_repo.account_rows(self.db, user.id)
        media = rows.pop("media")
        account = {
            "id": user.id,
            "email": user.email,
            "username": user.username,
            "display_name": user.display_name,
            "avatar_url": user.avatar_url,
            "role": user.role,
            "email_verified_at": user.email_verified_at,
            "birth_date": user.birth_date,
            "locale": user.locale,
            "timezone": user.timezone,
            "status": user.status,
            "created_at": user.created_at,
            "updated_at": user.updated_at,
        }
        output = BytesIO()
        with ZipFile(output, "w", compression=ZIP_DEFLATED) as archive:
            archive.writestr("account.json", _json(account))
            archive.writestr(
                "sets.json",
                _json(
                    {
                        key: [_row(item) for item in rows[key]]
                        for key in (
                            "folders",
                            "sets",
                            "cards",
                            "courses",
                            "course_sections",
                            "course_articles",
                        )
                    }
                ),
            )
            archive.writestr(
                "learning.json",
                _json(
                    {
                        key: [_row(item) for item in rows[key]]
                        for key in (
                            "card_states",
                            "reviews",
                            "study_sessions",
                            "test_attempts",
                            "set_progress",
                        )
                    }
                ),
            )
            archive.writestr(
                "preferences.json",
                _json(
                    {
                        key: [_row(item) for item in rows[key]]
                        for key in ("settings", "oauth_accounts", "consents")
                    }
                ),
            )
            manifest: list[dict[str, object]] = []
            for asset in media:
                payload, _size = await get_object_storage().read(asset.s3_key, asset.size_bytes + 1)
                extension = mimetypes.guess_extension(asset.mime) or ""
                filename = f"media/{asset.id}{extension}"
                archive.writestr(filename, payload)
                manifest.append({**_row(asset), "archive_path": filename})
            archive.writestr("manifest.json", _json({"media": manifest}))
        return output.getvalue()

    async def store_archive(self, user: User, job: AccountExportJob, payload: bytes) -> None:
        settings = get_settings()
        storage_key = f"users/{user.id}/exports/{job.id}.zip"
        await get_object_storage().put(storage_key, payload, "application/zip")
        job.storage_key = storage_key
        job.size_bytes = len(payload)
        job.expires_at = datetime.now(UTC) + timedelta(hours=settings.account_export_ttl_hours)


def _row(value: Any) -> dict[str, object]:
    mapper = inspect(value).mapper
    return {column.key: getattr(value, column.key) for column in mapper.column_attrs}


def _json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2, default=_json_default)


def _json_default(value: object) -> str:
    if isinstance(value, (datetime,)):
        return value.isoformat()
    if hasattr(value, "isoformat"):
        return str(value.isoformat())
    if isinstance(value, (UUID, enum.Enum)):
        return str(value.value if isinstance(value, enum.Enum) else value)
    raise TypeError(f"Unsupported export value: {type(value).__name__}")
