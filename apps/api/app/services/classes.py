"""Сценарии классов: создание, членство и единая проверка прав."""

from __future__ import annotations

import secrets
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, ForbiddenError, NotFoundError
from app.models.classes import ClassMember, ClassMemberRole, ClassMemberStatus, Classroom
from app.models.user import User
from app.repositories import classes as repo
from app.schemas.classes import (
    ClassroomCreate,
    ClassroomDetailOut,
    ClassroomMemberAdd,
    ClassroomMemberOut,
    ClassroomOut,
    ClassroomUpdate,
)
from app.services.class_permissions import ClassAction, allows

_JOIN_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"


class ClassroomService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create(self, user: User, body: ClassroomCreate) -> ClassroomOut:
        classroom = Classroom(
            owner_id=user.id,
            title=body.title,
            description=body.description,
            join_code=await self._join_code(),
            settings={"requires_approval": body.requires_approval},
        )
        self.db.add(classroom)
        await self.db.flush()
        self.db.add(
            ClassMember(
                class_id=classroom.id,
                user_id=user.id,
                role=ClassMemberRole.teacher,
            )
        )
        await self.db.flush()
        return self._out(classroom, ClassMemberRole.teacher)

    async def list_mine(self, user: User) -> list[ClassroomOut]:
        return [
            self._out(classroom, member.role)
            for classroom, member in await repo.list_for_user(self.db, user.id)
        ]

    async def get(self, user: User, class_id: UUID) -> ClassroomDetailOut:
        classroom, member = await self._authorized(user, class_id, ClassAction.view)
        members = (
            [
                self._member_out(row, account)
                for row, account in await repo.list_members(self.db, class_id)
            ]
            if allows(member.role, ClassAction.manage_members)
            else []
        )
        return ClassroomDetailOut(**self._out(classroom, member.role).model_dump(), members=members)

    async def update(self, user: User, class_id: UUID, body: ClassroomUpdate) -> ClassroomOut:
        classroom, member = await self._authorized(user, class_id, ClassAction.edit_class)
        values = body.model_dump(exclude_unset=True)
        requires_approval = values.pop("requires_approval", None)
        for field, value in values.items():
            setattr(classroom, field, value)
        if requires_approval is not None:
            classroom.settings = {**classroom.settings, "requires_approval": requires_approval}
        await self.db.flush()
        await self.db.refresh(classroom, attribute_names=["updated_at"])
        return self._out(classroom, member.role)

    async def add_member(
        self, user: User, class_id: UUID, body: ClassroomMemberAdd
    ) -> ClassroomMemberOut:
        _, actor = await self._authorized(user, class_id, ClassAction.manage_members)
        account = await repo.user_by_username(self.db, body.username)
        if account is None:
            raise NotFoundError("Пользователь не найден")
        existing = await repo.member(self.db, class_id, account.id)
        if existing is not None and existing.status is ClassMemberStatus.active:
            raise ConflictError("Пользователь уже состоит в классе")
        if existing is None:
            existing = ClassMember(
                class_id=class_id,
                user_id=account.id,
                role=body.role,
                status=ClassMemberStatus.active,
            )
            self.db.add(existing)
        else:
            existing.role = body.role
            existing.status = ClassMemberStatus.active
        if account.id == user.id and body.role is not ClassMemberRole.teacher:
            raise ForbiddenError("Владелец класса остаётся преподавателем")
        if actor.role is not ClassMemberRole.teacher:
            raise ForbiddenError("Недостаточно прав")
        await self.db.flush()
        return self._member_out(existing, account)

    async def _authorized(
        self, user: User, class_id: UUID, action: ClassAction
    ) -> tuple[Classroom, ClassMember]:
        classroom = await repo.classroom(self.db, class_id)
        if classroom is None:
            raise NotFoundError("Класс не найден")
        member = await repo.active_member(self.db, class_id, user.id)
        if member is None or not allows(member.role, action):
            raise ForbiddenError("Нет доступа к этому классу")
        return classroom, member

    async def _join_code(self) -> str:
        for _ in range(5):
            code = "".join(secrets.choice(_JOIN_ALPHABET) for _ in range(8))
            existing = await self.db.scalar(select(Classroom.id).where(Classroom.join_code == code))
            if existing is None:
                return code
        raise ConflictError("Не удалось создать код вступления")

    @staticmethod
    def _out(classroom: Classroom, role: ClassMemberRole) -> ClassroomOut:
        return ClassroomOut(
            id=classroom.id,
            title=classroom.title,
            description=classroom.description,
            join_code=classroom.join_code,
            requires_approval=bool(classroom.settings.get("requires_approval", False)),
            archived_at=classroom.archived_at,
            my_role=role,
            created_at=classroom.created_at,
            updated_at=classroom.updated_at,
        )

    @staticmethod
    def _member_out(member: ClassMember, user: User) -> ClassroomMemberOut:
        return ClassroomMemberOut(
            user_id=user.id,
            username=user.username,
            display_name=user.display_name,
            role=member.role,
            status=member.status,
            joined_at=member.joined_at,
        )
