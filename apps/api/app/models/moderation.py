"""Жалобы на публичные материалы и решения постмодерации.

Постмодерация: жалоба сама по себе ничего не скрывает. Курс остаётся доступным,
пока модератор не примет решение; только оно меняет `Course.moderation_status`.
"""

import enum
from datetime import datetime
from uuid import UUID

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class ReportReason(enum.StrEnum):
    """Причина жалобы; список закрыт, свободный текст идёт в `comment`."""

    spam = "spam"
    misleading = "misleading"
    copyright = "copyright"
    offensive = "offensive"
    adult = "adult"
    other = "other"


class ReportStatus(enum.StrEnum):
    """`accepted` — жалоба обоснована и курс заблокирован, `rejected` — отклонена."""

    open = "open"
    accepted = "accepted"
    rejected = "rejected"


def _values(values: type[enum.Enum]) -> str:
    return ", ".join(f"'{item.value}'" for item in values)


class CourseReport(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Жалоба на курс. Публичная единица — только курс, см. docs/06-courses-brief.md."""

    __tablename__ = "course_reports"
    __table_args__ = (
        CheckConstraint(f"reason IN ({_values(ReportReason)})", name="reason"),
        CheckConstraint(f"status IN ({_values(ReportStatus)})", name="status"),
        # Один открытый сигнал от пользователя на курс; после решения можно пожаловаться снова.
        Index(
            "uq_course_reports_open",
            "course_id",
            "reporter_id",
            unique=True,
            postgresql_where=text("status = 'open'"),
        ),
    )

    course_id: Mapped[UUID] = mapped_column(
        ForeignKey("courses.id", ondelete="CASCADE"), index=True
    )
    reporter_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    reason: Mapped[str] = mapped_column(String(32))
    comment: Mapped[str] = mapped_column(Text, default="", server_default=text("''"))
    status: Mapped[str] = mapped_column(
        String(16), default=ReportStatus.open.value, server_default="open"
    )
    # Модератора не удаляем вместе с решением: SET NULL сохраняет разобранную жалобу.
    resolved_by_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
