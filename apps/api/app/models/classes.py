"""Модели учебных классов, заданий и их измеримого прогресса."""

from __future__ import annotations

import enum
from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.study import StudyMode


class ClassMemberRole(enum.Enum):
    teacher = "teacher"
    assistant = "assistant"
    student = "student"


class ClassMemberStatus(enum.Enum):
    active = "active"
    pending = "pending"
    left = "left"


class AssignmentGoalType(enum.Enum):
    mastery_percent = "mastery_percent"
    cards_count = "cards_count"
    test_score = "test_score"


class AssignmentProgressStatus(enum.Enum):
    not_started = "not_started"
    in_progress = "in_progress"
    done = "done"
    late = "late"


class Classroom(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "classes"
    __table_args__ = (Index("ix_classes_owner_id_archived_at", "owner_id", "archived_at"),)

    owner_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text, default="", server_default=text("''"))
    join_code: Mapped[str] = mapped_column(String(12), unique=True, index=True)
    # Учреждения появятся только вместе с B2B-контуром; до этого идентификатор намеренно
    # не связан внешним ключом с несуществующей таблицей школ.
    school_id: Mapped[UUID | None] = mapped_column(index=True)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    settings: Mapped[dict[str, Any]] = mapped_column(
        JSONB, default=dict, server_default=text("'{}'::jsonb")
    )


class ClassMember(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "class_members"
    __table_args__ = (
        UniqueConstraint("class_id", "user_id", name="uq_class_members_class_id_user_id"),
        Index("ix_class_members_class_id_status", "class_id", "status"),
        Index("ix_class_members_user_id_status", "user_id", "status"),
    )

    class_id: Mapped[UUID] = mapped_column(ForeignKey("classes.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    role: Mapped[ClassMemberRole] = mapped_column(Enum(ClassMemberRole))
    status: Mapped[ClassMemberStatus] = mapped_column(
        Enum(ClassMemberStatus), default=ClassMemberStatus.active, server_default=text("'active'")
    )
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ClassSet(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "class_sets"
    __table_args__ = (UniqueConstraint("class_id", "set_id", name="uq_class_sets_class_id_set_id"),)

    class_id: Mapped[UUID] = mapped_column(ForeignKey("classes.id", ondelete="CASCADE"), index=True)
    set_id: Mapped[UUID] = mapped_column(
        ForeignKey("study_sets.id", ondelete="CASCADE"), index=True
    )
    added_by: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    added_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Assignment(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "assignments"
    __table_args__ = (
        Index("ix_assignments_class_id_due_at", "class_id", "due_at"),
        CheckConstraint("goal_value > 0", name="goal_value_positive"),
    )

    class_id: Mapped[UUID] = mapped_column(ForeignKey("classes.id", ondelete="CASCADE"), index=True)
    set_id: Mapped[UUID] = mapped_column(
        ForeignKey("study_sets.id", ondelete="RESTRICT"), index=True
    )
    title: Mapped[str] = mapped_column(String(160))
    mode_required: Mapped[StudyMode | None] = mapped_column(Enum(StudyMode))
    goal_type: Mapped[AssignmentGoalType] = mapped_column(Enum(AssignmentGoalType))
    goal_value: Mapped[int] = mapped_column(Integer)
    open_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    created_by: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)


class AssignmentProgress(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "assignment_progress"
    __table_args__ = (
        UniqueConstraint(
            "assignment_id", "user_id", name="uq_assignment_progress_assignment_id_user_id"
        ),
        Index("ix_assignment_progress_assignment_id_status", "assignment_id", "status"),
    )

    assignment_id: Mapped[UUID] = mapped_column(
        ForeignKey("assignments.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    progress_value: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_activity_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[AssignmentProgressStatus] = mapped_column(
        Enum(AssignmentProgressStatus),
        default=AssignmentProgressStatus.not_started,
        server_default=text("'not_started'"),
    )
