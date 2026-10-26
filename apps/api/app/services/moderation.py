"""Постмодерация: жалобы пользователей и решения модератора.

Правило этапа E6A: публикация доступна сразу, жалоба сама по себе ничего не скрывает.
Видимость курса меняет только решение модератора. Полная панель модератора,
автоматические фильтры и журнал действий запланированы в E10.
"""

import re
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, ForbiddenError, NotFoundError
from app.models.courses import Course
from app.models.moderation import (
    AuditLog,
    CourseReport,
    ModerationAction,
    ReportReason,
    ReportStatus,
)
from app.models.user import User, UserRole, UserStatus
from app.repositories import courses as courses_repo
from app.repositories import moderation as repo
from app.repositories import token as token_repo
from app.repositories.api_tokens import lock_request
from app.schemas.moderation import (
    AuditLogItem,
    ModerationActionItem,
    ModerationActionRequest,
    ModerationCourseItem,
    ReportCreate,
    ReportItem,
    ReportResolution,
    ReportSubmitted,
)

MODERATOR_ROLES = frozenset({UserRole.moderator, UserRole.admin})
SUSPICIOUS_PATTERNS = (
    re.compile(r"(?:казино|ставк[аи]|наркотик|порнограф)", re.IGNORECASE),
    re.compile(r"(?:https?://|t\.me/|@\w+).*(?:https?://|t\.me/|@\w+)", re.IGNORECASE),
)


def _item(report: CourseReport, course: Course, reporter_username: str) -> ReportItem:
    return ReportItem(
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
        reporter_username=reporter_username,
    )


class ModerationService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def report(self, user: User, slug: str, body: ReportCreate) -> ReportSubmitted:
        # Блокировка на пользователя сериализует его же повторные отправки.
        await lock_request(self.db, user.id)
        course = await courses_repo.public_course(self.db, slug)
        if course is None:
            raise NotFoundError("Курс не найден")
        if course.owner_id == user.id:
            raise ForbiddenError("Нельзя пожаловаться на собственный курс")
        if await repo.has_open_report(self.db, course.id, user.id):
            raise ConflictError("Жалоба на этот курс уже отправлена и ожидает решения")
        try:
            async with self.db.begin_nested():
                report = await repo.add_report(
                    self.db, course.id, user.id, body.reason.value, body.comment
                )
        except IntegrityError as exc:
            # Частичный уникальный индекс закрывает гонку двух параллельных отправок.
            raise ConflictError("Жалоба на этот курс уже отправлена и ожидает решения") from exc
        return ReportSubmitted.model_validate(report)

    async def queue(
        self, status: ReportStatus | None, *, offset: int = 0, limit: int = 50
    ) -> list[ReportItem]:
        return [
            _item(report, course, username)
            for report, course, username in await repo.queue(
                self.db, status, offset=offset, limit=limit
            )
        ]

    async def resolve(
        self,
        moderator: User,
        report_id: UUID,
        body: ReportResolution,
        *,
        ip: str | None = None,
        request_id: str | None = None,
    ) -> ReportItem:
        await lock_request(self.db, moderator.id)
        report = await repo.get_report(self.db, report_id)
        if report is None:
            raise NotFoundError("Жалоба не найдена")
        if report.status != ReportStatus.open.value:
            raise ConflictError("Жалоба уже разобрана")
        course = await courses_repo.get_course(self.db, report.course_id)
        if course is None:
            raise NotFoundError("Курс не найден")
        reporter = await self.db.get(User, report.reporter_id)

        report.status = body.outcome.value
        report.resolved_by_id = moderator.id
        report.resolved_at = datetime.now(UTC)
        if body.outcome is ReportStatus.accepted:
            # Блокировка убирает курс из выдачи, но данные автора остаются нетронутыми.
            course.moderation_status = "blocked"
        elif course.moderation_status == "pending":
            # Отклонённая жалоба не снимает блокировку, поставленную по другой жалобе.
            course.moderation_status = "ok"
        self._record(
            moderator,
            action=f"report_{body.outcome.value}",
            course=course,
            reason=f"Решение по жалобе {report.id}",
            details={"report_id": str(report.id)},
            ip=ip,
            request_id=request_id,
        )
        await self.db.flush()
        await self.db.refresh(report)
        await self.db.refresh(course)
        # Индекс поиска подтянет изменение ближайшей сверкой; доступ уже закрыт в PostgreSQL.
        return _item(report, course, reporter.username if reporter else "")

    async def courses(self, *, offset: int = 0, limit: int = 50) -> list[ModerationCourseItem]:
        result: list[ModerationCourseItem] = []
        for course, owner, open_reports in await repo.course_queue(
            self.db, offset=offset, limit=limit
        ):
            signals = _automatic_signals(course)
            result.append(
                ModerationCourseItem(
                    id=course.id,
                    slug=course.slug,
                    title=course.title,
                    description=course.description,
                    is_published=course.is_published,
                    moderation_status=course.moderation_status,
                    owner_id=owner.id,
                    owner_username=owner.username,
                    owner_status=owner.status.value,
                    open_reports=open_reports,
                    priority=open_reports * 100 + len(signals) * 10,
                    automatic_signals=signals,
                    created_at=course.created_at,
                )
            )
        return sorted(result, key=lambda item: (-item.priority, item.created_at))

    async def act(
        self,
        moderator: User,
        course_id: UUID,
        body: ModerationActionRequest,
        *,
        ip: str | None = None,
        request_id: str | None = None,
    ) -> ModerationActionItem:
        await lock_request(self.db, moderator.id)
        course = await courses_repo.get_course(self.db, course_id)
        if course is None:
            raise NotFoundError("Курс не найден")
        owner = await self.db.get(User, course.owner_id)
        if owner is None:
            raise NotFoundError("Автор курса не найден")
        if body.action == "ban_author" and moderator.role is not UserRole.admin:
            raise ForbiddenError("Блокировать пользователей может только администратор")
        if owner.id == moderator.id:
            raise ForbiddenError("Нельзя модерировать собственный курс")

        if body.action == "unpublish":
            course.is_published = False
            course.is_listed = False
            course.published_at = None
        elif body.action == "block":
            course.moderation_status = "blocked"
        elif body.action == "restore":
            course.moderation_status = "ok"
        elif body.action == "ban_author":
            owner.status = UserStatus.suspended
            course.moderation_status = "blocked"
            await token_repo.revoke_all_user_tokens(self.db, owner.id)

        action = self._record(
            moderator,
            action=body.action,
            course=course,
            reason=body.reason,
            details={"owner_id": str(owner.id)},
            ip=ip,
            request_id=request_id,
        )
        await self.db.flush()
        await self.db.refresh(action)
        return ModerationActionItem.model_validate(action)

    async def actions(self, *, offset: int = 0, limit: int = 100) -> list[ModerationActionItem]:
        return [
            ModerationActionItem.model_validate(item)
            for item in await repo.moderation_history(self.db, offset=offset, limit=limit)
        ]

    async def audit(self, *, offset: int = 0, limit: int = 100) -> list[AuditLogItem]:
        return [
            AuditLogItem.model_validate(item)
            for item in await repo.audit_history(self.db, offset=offset, limit=limit)
        ]

    async def warnings_for(self, user: User) -> list[ModerationActionItem]:
        return [
            ModerationActionItem.model_validate(item)
            for item in await repo.warnings_for_owner(self.db, user.id)
        ]

    def _record(
        self,
        moderator: User,
        *,
        action: str,
        course: Course,
        reason: str,
        details: dict[str, str],
        ip: str | None,
        request_id: str | None,
    ) -> ModerationAction:
        item = ModerationAction(
            actor_id=moderator.id,
            action=action,
            target_type="course",
            target_id=course.id,
            reason=reason,
            details=details,
        )
        self.db.add(item)
        self.db.add(
            AuditLog(
                actor_id=moderator.id,
                event=f"moderation.{action}",
                target_type="course",
                target_id=course.id,
                details=details,
                ip=ip,
                request_id=request_id,
            )
        )
        return item


def _automatic_signals(course: Course) -> list[str]:
    text = f"{course.title}\n{course.description}".strip()
    signals: list[str] = []
    if any(pattern.search(text) for pattern in SUSPICIOUS_PATTERNS):
        signals.append("Подозрительные слова или ссылки")
    if text:
        non_text = sum(not (char.isalnum() or char.isspace()) for char in text)
        if non_text / len(text) > 0.35:
            signals.append("Высокая доля нетекстовых символов")
    if not course.description.strip():
        signals.append("Нет описания")
    return signals
