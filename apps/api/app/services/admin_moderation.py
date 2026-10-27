"""Защищённая модерация публикаций из административной панели."""

import hashlib
import json
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.email import send_moderation_warning_email
from app.core.errors import ConflictError, NotFoundError
from app.models.moderation import ReportReason, ReportStatus
from app.models.user import User
from app.repositories import admin_security as security_repo
from app.repositories import moderation as repo
from app.schemas.admin_moderation import (
    AdminModerationCourseDetail,
    AdminModerationCourseItem,
    AdminModerationCourseList,
    AdminModerationHistoryItem,
    AdminModerationReportItem,
    AdminModerationReportList,
)
from app.services.search_sync import queue_course


def _report_item(row: Any) -> AdminModerationReportItem:
    report, course, reporter_username, author_id, author_username = row
    return AdminModerationReportItem(
        id=report.id,
        reason=ReportReason(report.reason),
        comment=report.comment,
        status=ReportStatus(report.status),
        created_at=report.created_at,
        resolved_at=report.resolved_at,
        course_id=course.id,
        course_slug=course.slug,
        course_title=course.title,
        course_moderation_status=course.moderation_status,
        course_is_published=course.is_published,
        author_id=author_id,
        author_username=author_username,
        reporter_username=reporter_username,
    )


def _risk_signals(
    *, moderation_status: str, is_published: bool, is_listed: bool, open_reports: int
) -> list[str]:
    signals = []
    if open_reports:
        signals.append(f"Открытых жалоб: {open_reports}")
    if moderation_status == "blocked":
        signals.append("Публикация заблокирована")
    elif moderation_status == "pending":
        signals.append("Не проверена модератором")
    if not is_published:
        signals.append("Снята с публикации")
    elif not is_listed:
        signals.append("Скрыта из каталога")
    return signals


class AdminModerationService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def reports(
        self,
        *,
        status: ReportStatus | None,
        query: str | None,
        offset: int,
        limit: int,
    ) -> AdminModerationReportList:
        rows, total = await repo.admin_reports(
            self.db, status=status, query=query, offset=offset, limit=limit
        )
        return AdminModerationReportList(
            items=[_report_item(row) for row in rows],
            total=total,
            offset=offset,
            limit=limit,
        )

    async def courses(
        self,
        *,
        query: str | None,
        moderation_status: str | None,
        published: bool | None,
        offset: int,
        limit: int,
    ) -> AdminModerationCourseList:
        rows, total = await repo.admin_courses(
            self.db,
            query=query,
            moderation_status=moderation_status,
            published=published,
            offset=offset,
            limit=limit,
        )
        return AdminModerationCourseList(
            items=[self._course_item(*row) for row in rows],
            total=total,
            offset=offset,
            limit=limit,
        )

    async def course(self, course_id: UUID) -> AdminModerationCourseDetail:
        record = await repo.admin_course(self.db, course_id)
        if record is None:
            raise NotFoundError("Курс не найден")
        course, author = record
        report_rows = await repo.reports_for_course(self.db, course_id)
        reports = [_report_item(row) for row in report_rows]
        history_rows = await repo.course_history(self.db, course_id)
        item = self._course_item(
            course,
            author.id,
            author.username,
            len(reports),
            sum(report.status is ReportStatus.open for report in reports),
            max((report.created_at for report in reports), default=None),
        )
        return AdminModerationCourseDetail(
            **item.model_dump(),
            reports=reports,
            history=[
                AdminModerationHistoryItem(
                    id=audit.id,
                    action=audit.action,
                    actor_username=username,
                    reason=audit.reason,
                    details=audit.details,
                    created_at=audit.created_at,
                )
                for audit, username in history_rows
            ],
        )

    async def resolve_report(
        self,
        *,
        actor: User,
        report_id: UUID,
        outcome: ReportStatus,
        reason: str,
        idempotency_key: str,
        ip: str | None,
        user_agent: str | None,
    ) -> AdminModerationCourseDetail:
        report = await repo.get_report_for_update(self.db, report_id)
        if report is None:
            raise NotFoundError("Жалоба не найдена")
        record = await repo.admin_course(self.db, report.course_id, for_update=True)
        if record is None:
            raise NotFoundError("Курс не найден")
        course, _ = record
        payload = {"report_id": report_id, "outcome": outcome.value, "reason": reason}
        if await self._repeated(
            actor=actor,
            action="admin.moderation.report_resolved",
            target_id=course.id,
            payload=payload,
            idempotency_key=idempotency_key,
        ):
            return await self.course(course.id)
        if report.status != ReportStatus.open.value:
            raise ConflictError("Жалоба уже разобрана")

        previous_status = course.moderation_status
        report.status = outcome.value
        report.resolved_by_id = actor.id
        report.resolved_at = datetime.now(UTC)
        if outcome is ReportStatus.accepted:
            course.moderation_status = "blocked"
        elif course.moderation_status == "pending":
            course.moderation_status = "ok"
        await self.db.flush()
        await security_repo.add_audit(
            self.db,
            actor_user_id=actor.id,
            action="admin.moderation.report_resolved",
            outcome="success",
            target_type="course",
            target_id=course.id,
            reason=reason,
            idempotency_key=idempotency_key,
            ip=ip,
            user_agent=user_agent,
            details={
                "request_hash": self._request_hash(
                    "admin.moderation.report_resolved", course.id, payload
                ),
                "report_id": str(report.id),
                "resolution": outcome.value,
                "old_moderation_status": previous_status,
                "new_moderation_status": course.moderation_status,
            },
        )
        await queue_course(self.db, course.id)
        return await self.course(course.id)

    async def act_on_course(
        self,
        *,
        actor: User,
        course_id: UUID,
        action: str,
        reason: str,
        idempotency_key: str,
        ip: str | None,
        user_agent: str | None,
    ) -> AdminModerationCourseDetail:
        record = await repo.admin_course(self.db, course_id, for_update=True)
        if record is None:
            raise NotFoundError("Курс не найден")
        course, author = record
        audit_action = f"admin.moderation.course_{action}"
        payload = {"action": action, "reason": reason}
        if await self._repeated(
            actor=actor,
            action=audit_action,
            target_id=course.id,
            payload=payload,
            idempotency_key=idempotency_key,
        ):
            return await self.course(course.id)

        previous = {
            "is_published": course.is_published,
            "moderation_status": course.moderation_status,
        }
        if action == "warn":
            if not author.email:
                raise ConflictError("У автора нет email для предупреждения")
        elif action == "unpublish":
            if not course.is_published:
                raise ConflictError("Курс уже снят с публикации")
            course.is_published = False
        elif action == "block":
            if course.moderation_status == "blocked":
                raise ConflictError("Курс уже заблокирован")
            course.moderation_status = "blocked"
        elif action == "restore":
            if course.moderation_status != "blocked":
                raise ConflictError("Курс не заблокирован")
            course.moderation_status = "ok"
        else:
            raise ConflictError("Неизвестное действие модерации")

        await self.db.flush()
        await security_repo.add_audit(
            self.db,
            actor_user_id=actor.id,
            action=audit_action,
            outcome="success",
            target_type="course",
            target_id=course.id,
            reason=reason,
            idempotency_key=idempotency_key,
            ip=ip,
            user_agent=user_agent,
            details={
                "request_hash": self._request_hash(audit_action, course.id, payload),
                "old": previous,
                "new": {
                    "is_published": course.is_published,
                    "moderation_status": course.moderation_status,
                },
                "author_id": str(author.id),
            },
        )
        if action == "warn":
            await send_moderation_warning_email(author.email or "", course.title, reason)
        else:
            await queue_course(self.db, course.id)
        return await self.course(course.id)

    async def _repeated(
        self,
        *,
        actor: User,
        action: str,
        target_id: UUID,
        payload: dict[str, Any],
        idempotency_key: str,
    ) -> bool:
        existing = await security_repo.get_audit_by_idempotency(self.db, idempotency_key)
        if existing is None:
            return False
        expected = self._request_hash(action, target_id, payload)
        if (
            existing.actor_user_id != actor.id
            or existing.action != action
            or existing.target_id != target_id
            or existing.details.get("request_hash") != expected
        ):
            raise ConflictError("Ключ идемпотентности уже использован для другого действия")
        return True

    @staticmethod
    def _request_hash(action: str, target_id: UUID, payload: dict[str, Any]) -> str:
        value = json.dumps(
            {"action": action, "target_id": str(target_id), "payload": payload},
            sort_keys=True,
            ensure_ascii=False,
            default=str,
            separators=(",", ":"),
        )
        return hashlib.sha256(value.encode()).hexdigest()

    @staticmethod
    def _course_item(
        course: Any,
        author_id: UUID,
        author_username: str,
        reports_total: int,
        reports_open: int,
        last_report_at: datetime | None,
    ) -> AdminModerationCourseItem:
        return AdminModerationCourseItem(
            id=course.id,
            slug=course.slug,
            title=course.title,
            description=course.description,
            author_id=author_id,
            author_username=author_username,
            is_published=course.is_published,
            is_listed=course.is_listed,
            moderation_status=course.moderation_status,
            published_at=course.published_at,
            updated_at=course.updated_at,
            reports_total=reports_total,
            reports_open=reports_open,
            last_report_at=last_report_at,
            risk_signals=_risk_signals(
                moderation_status=course.moderation_status,
                is_published=course.is_published,
                is_listed=course.is_listed,
                open_reports=reports_open,
            ),
        )
