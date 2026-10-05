"""Запросы к классам и участникам без правил авторизации."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.classes import (
    Assignment,
    AssignmentProgress,
    ClassMember,
    ClassMemberRole,
    ClassMemberStatus,
    Classroom,
    ClassSet,
)
from app.models.content import StudySet
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
