"""Запросы к классам и участникам без правил авторизации."""

from datetime import datetime
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.classes import (
    Assignment,
    AssignmentProgress,
    AssignmentProgressStatus,
    ClassMember,
    ClassMemberRole,
    ClassMemberStatus,
    Classroom,
    ClassSet,
)
from app.models.content import Card, StudySet
from app.models.study import Review, StudyMode, TestAttempt, UserSetProgress
from app.models.user import User


async def classroom(db: AsyncSession, class_id: UUID) -> Classroom | None:
    return await db.get(Classroom, class_id)


async def classroom_by_join_code(db: AsyncSession, join_code: str) -> Classroom | None:
    row = await db.scalar(
        select(Classroom).where(Classroom.join_code == join_code, Classroom.archived_at.is_(None))
    )
    return row


async def member(db: AsyncSession, class_id: UUID, user_id: UUID) -> ClassMember | None:
    row = await db.scalar(
        select(ClassMember).where(
            ClassMember.class_id == class_id,
            ClassMember.user_id == user_id,
        )
    )
    return row


async def active_member(db: AsyncSession, class_id: UUID, user_id: UUID) -> ClassMember | None:
    row = await db.scalar(
        select(ClassMember).where(
            ClassMember.class_id == class_id,
            ClassMember.user_id == user_id,
            ClassMember.status == ClassMemberStatus.active,
        )
    )
    return row


async def list_for_user(db: AsyncSession, user_id: UUID) -> list[tuple[Classroom, ClassMember]]:
    rows = await db.execute(
        select(Classroom, ClassMember)
        .join(ClassMember, ClassMember.class_id == Classroom.id)
        .where(
            ClassMember.user_id == user_id,
            ClassMember.status == ClassMemberStatus.active,
        )
        .order_by(Classroom.archived_at.is_(None).desc(), Classroom.created_at.desc())
    )
    return list(rows.tuples().all())


async def list_members(db: AsyncSession, class_id: UUID) -> list[tuple[ClassMember, User]]:
    rows = await db.execute(
        select(ClassMember, User)
        .join(User, User.id == ClassMember.user_id)
        .where(ClassMember.class_id == class_id)
        .order_by(ClassMember.joined_at, User.username)
    )
    return list(rows.tuples().all())


async def member_by_id(db: AsyncSession, class_id: UUID, member_id: UUID) -> ClassMember | None:
    row = await db.scalar(
        select(ClassMember).where(ClassMember.id == member_id, ClassMember.class_id == class_id)
    )
    return row


async def active_students(db: AsyncSession, class_id: UUID) -> list[ClassMember]:
    rows = await db.scalars(
        select(ClassMember).where(
            ClassMember.class_id == class_id,
            ClassMember.status == ClassMemberStatus.active,
            ClassMember.role == ClassMemberRole.student,
        )
    )
    return list(rows.all())


async def class_set(db: AsyncSession, class_id: UUID, set_id: UUID) -> ClassSet | None:
    row = await db.scalar(
        select(ClassSet).where(ClassSet.class_id == class_id, ClassSet.set_id == set_id)
    )
    return row


async def list_sets(db: AsyncSession, class_id: UUID) -> list[tuple[ClassSet, StudySet]]:
    rows = await db.execute(
        select(ClassSet, StudySet)
        .join(StudySet, StudySet.id == ClassSet.set_id)
        .where(ClassSet.class_id == class_id, StudySet.deleted_at.is_(None))
        .order_by(ClassSet.added_at)
    )
    return list(rows.tuples().all())


async def list_assignments(db: AsyncSession, class_id: UUID) -> list[Assignment]:
    rows = await db.scalars(
        select(Assignment)
        .where(Assignment.class_id == class_id)
        .order_by(Assignment.due_at.is_(None), Assignment.due_at, Assignment.created_at.desc())
    )
    return list(rows.all())


async def user_by_username(db: AsyncSession, username: str) -> User | None:
    row = await db.scalar(select(User).where(User.username == username))
    return row


async def user_by_id(db: AsyncSession, user_id: UUID) -> User | None:
    return await db.get(User, user_id)


async def add_assignment_progress(db: AsyncSession, assignment_id: UUID, user_id: UUID) -> None:
    await db.execute(
        insert(AssignmentProgress)
        .values(assignment_id=assignment_id, user_id=user_id)
        .on_conflict_do_nothing(constraint="uq_assignment_progress_assignment_id_user_id")
    )


async def progress_rows(
    db: AsyncSession, assignment_ids: set[UUID], user_ids: set[UUID]
) -> dict[tuple[UUID, UUID], AssignmentProgress]:
    if not assignment_ids or not user_ids:
        return {}
    rows = await db.scalars(
        select(AssignmentProgress).where(
            AssignmentProgress.assignment_id.in_(assignment_ids),
            AssignmentProgress.user_id.in_(user_ids),
        )
    )
    return {(row.assignment_id, row.user_id): row for row in rows.all()}


async def upsert_progress(
    db: AsyncSession,
    assignment_id: UUID,
    user_id: UUID,
    *,
    value: int,
    status: AssignmentProgressStatus,
    completed_at: datetime | None,
    last_activity_at: datetime | None,
) -> None:
    await db.execute(
        insert(AssignmentProgress)
        .values(
            assignment_id=assignment_id,
            user_id=user_id,
            progress_value=value,
            status=status,
            completed_at=completed_at,
            last_activity_at=last_activity_at,
        )
        .on_conflict_do_update(
            constraint="uq_assignment_progress_assignment_id_user_id",
            set_={
                "progress_value": value,
                "status": status,
                "completed_at": completed_at,
                "last_activity_at": last_activity_at,
            },
        )
    )


async def set_progress_values(
    db: AsyncSession, user_ids: set[UUID], set_ids: set[UUID]
) -> dict[tuple[UUID, UUID], tuple[float, datetime | None]]:
    if not user_ids or not set_ids:
        return {}
    rows = await db.execute(
        select(
            UserSetProgress.user_id,
            UserSetProgress.set_id,
            UserSetProgress.mastery_percent,
            UserSetProgress.last_studied_at,
        ).where(
            UserSetProgress.user_id.in_(user_ids), UserSetProgress.set_id.in_(set_ids)
        )
    )
    return {
        (user_id, set_id): (float(value), last_activity)
        for user_id, set_id, value, last_activity in rows.all()
    }


async def reviewed_card_values(
    db: AsyncSession, user_ids: set[UUID], set_ids: set[UUID]
) -> dict[tuple[UUID, UUID, StudyMode | None], tuple[int, datetime]]:
    if not user_ids or not set_ids:
        return {}
    by_mode = await db.execute(
        select(
            Review.user_id,
            Review.set_id,
            Review.mode,
            func.count(func.distinct(Review.card_id)),
            func.max(Review.reviewed_at),
        )
        .where(Review.user_id.in_(user_ids), Review.set_id.in_(set_ids))
        .group_by(Review.user_id, Review.set_id, Review.mode)
    )
    values: dict[tuple[UUID, UUID, StudyMode | None], tuple[int, datetime]] = {
        (user_id, set_id, mode): (int(count), last_activity)
        for user_id, set_id, mode, count, last_activity in by_mode.all()
    }
    all_modes = await db.execute(
        select(
            Review.user_id,
            Review.set_id,
            func.count(func.distinct(Review.card_id)),
            func.max(Review.reviewed_at),
        )
        .where(Review.user_id.in_(user_ids), Review.set_id.in_(set_ids))
        .group_by(Review.user_id, Review.set_id)
    )
    values.update(
        {
            (user_id, set_id, None): (int(count), last_activity)
            for user_id, set_id, count, last_activity in all_modes.all()
        }
    )
    return values


async def best_test_values(
    db: AsyncSession, user_ids: set[UUID], set_ids: set[UUID]
) -> dict[tuple[UUID, UUID], tuple[float, datetime]]:
    if not user_ids or not set_ids:
        return {}
    rows = await db.execute(
        select(
            TestAttempt.user_id,
            TestAttempt.set_id,
            func.max(TestAttempt.score),
            func.max(TestAttempt.finished_at),
        )
        .where(
            TestAttempt.user_id.in_(user_ids),
            TestAttempt.set_id.in_(set_ids),
            TestAttempt.finished_at.is_not(None),
        )
        .group_by(TestAttempt.user_id, TestAttempt.set_id)
    )
    return {
        (user_id, set_id): (float(score or 0), finished_at)
        for user_id, set_id, score, finished_at in rows.all()
    }


async def card_error_rows(
    db: AsyncSession, class_id: UUID
) -> list[tuple[Card, StudySet, int, int, int]]:
    rows = await db.execute(
        select(
            Card,
            StudySet,
            func.count(Review.id).label("answers_count"),
            func.count(Review.id).filter(Review.answer_correct.is_(False)).label("errors_count"),
            func.count(func.distinct(Review.user_id))
            .filter(Review.answer_correct.is_(False))
            .label("students_with_errors"),
        )
        .join(StudySet, StudySet.id == Card.set_id)
        .join(Review, Review.card_id == Card.id)
        .join(
            ClassMember,
            (ClassMember.user_id == Review.user_id)
            & (ClassMember.class_id == class_id)
            & (ClassMember.status == ClassMemberStatus.active)
            & (ClassMember.role == ClassMemberRole.student),
        )
        .where(
            Review.answer_correct.is_not(None),
            Card.set_id.in_(
                select(Assignment.set_id).where(Assignment.class_id == class_id).distinct()
            )
        )
        .group_by(Card.id, StudySet.id)
        .order_by(
            func.count(Review.id).filter(Review.answer_correct.is_(False)).desc(),
            Card.position,
        )
    )
    return [
        (card, study_set, int(answers), int(errors), int(students))
        for card, study_set, answers, errors, students in rows.all()
    ]
