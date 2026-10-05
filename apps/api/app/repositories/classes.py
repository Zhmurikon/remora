"""Запросы к классам и участникам без правил авторизации."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.classes import ClassMember, ClassMemberStatus, Classroom
from app.models.user import User


async def classroom(db: AsyncSession, class_id: UUID) -> Classroom | None:
    return await db.get(Classroom, class_id)


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


async def user_by_username(db: AsyncSession, username: str) -> User | None:
    row = await db.scalar(select(User).where(User.username == username))
    return row
