"""Серверный прогресс автономных тренажёров."""

from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class PythonPracticeProgress(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Лучший статус и последний черновик одной версии встроенной задачи."""

    __tablename__ = "python_practice_progress"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "task_id",
            "task_version",
            name="uq_python_practice_progress_user_task_version",
        ),
    )

    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    task_id: Mapped[str] = mapped_column(String(120))
    task_version: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(16))
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    draft: Mapped[str] = mapped_column(Text)
    draft_updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_client_mutation_id: Mapped[UUID] = mapped_column()
