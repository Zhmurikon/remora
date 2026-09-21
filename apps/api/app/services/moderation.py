"""Постмодерация: жалобы пользователей и решения модератора.

Правило этапа E6A: публикация доступна сразу, жалоба сама по себе ничего не скрывает.
Видимость курса меняет только решение модератора. Полная панель модератора,
автоматические фильтры и журнал действий запланированы в E10.
"""

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, ForbiddenError, NotFoundError
from app.models.courses import Course
from app.models.moderation import CourseReport, ReportReason, ReportStatus
from app.models.user import User, UserRole
from app.repositories import courses as courses_repo
from app.repositories import moderation as repo
from app.repositories.api_tokens import lock_request
from app.schemas.moderation import ReportCreate, ReportItem, ReportResolution, ReportSubmitted

MODERATOR_ROLES = frozenset({UserRole.moderator, UserRole.admin})


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

    async def resolve(self, moderator: User, report_id: UUID, body: ReportResolution) -> ReportItem:
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
        await self.db.flush()
        await self.db.refresh(report)
        await self.db.refresh(course)
        # Индекс поиска подтянет изменение ближайшей сверкой; доступ уже закрыт в PostgreSQL.
        return _item(report, course, reporter.username if reporter else "")
