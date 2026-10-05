"""Сценарии классов: создание, членство и единая проверка прав."""

from __future__ import annotations

import secrets
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.models.classes import (
    Assignment,
    ClassMember,
    ClassMemberRole,
    ClassMemberStatus,
    Classroom,
    ClassSet,
)
from app.models.content import StudySet
from app.models.user import User
from app.repositories import classes as repo
from app.schemas.classes import (
    AssignmentCreate,
    AssignmentOut,
    ClassroomCreate,
    ClassroomDetailOut,
    ClassroomInviteOut,
    ClassroomJoin,
    ClassroomJoinOut,
    ClassroomMemberAdd,
    ClassroomMemberOut,
    ClassroomOut,
    ClassroomUpdate,
    ClassSetAdd,
    ClassSetOut,
)
from app.services.class_permissions import ClassAction, allows
from app.services.content import ContentService

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
        await self._seed_assignment_progress(class_id, existing)
        return self._member_out(existing, account)

    async def join(self, user: User, body: ClassroomJoin) -> ClassroomJoinOut:
        classroom = await repo.classroom_by_join_code(self.db, body.join_code.upper().strip())
        if classroom is None:
            raise NotFoundError("Класс по этому коду не найден")
        member = await repo.member(self.db, classroom.id, user.id)
        if member is not None and member.status is ClassMemberStatus.active:
            return self._join_out(classroom, member)
        status = (
            ClassMemberStatus.pending
            if bool(classroom.settings.get("requires_approval", False))
            else ClassMemberStatus.active
        )
        if member is None:
            member = ClassMember(
                class_id=classroom.id,
                user_id=user.id,
                role=ClassMemberRole.student,
                status=status,
            )
            self.db.add(member)
        else:
            member.role = ClassMemberRole.student
            member.status = status
        await self.db.flush()
        if status is ClassMemberStatus.active:
            await self._seed_assignment_progress(classroom.id, member)
        return self._join_out(classroom, member)

    async def invite(self, user: User, class_id: UUID) -> ClassroomInviteOut:
        classroom, _ = await self._authorized(user, class_id, ClassAction.manage_members)
        return self._invite_out(classroom)

    async def rotate_join_code(self, user: User, class_id: UUID) -> ClassroomInviteOut:
        classroom, _ = await self._authorized(user, class_id, ClassAction.manage_members)
        classroom.join_code = await self._join_code()
        await self.db.flush()
        return self._invite_out(classroom)

    async def approve_member(
        self, user: User, class_id: UUID, member_id: UUID
    ) -> ClassroomMemberOut:
        _, _actor = await self._authorized(user, class_id, ClassAction.manage_members)
        member = await repo.member_by_id(self.db, class_id, member_id)
        if member is None:
            raise NotFoundError("Заявка на вступление не найдена")
        if member.status is not ClassMemberStatus.pending:
            raise ConflictError("Заявка уже обработана")
        member.status = ClassMemberStatus.active
        await self._seed_assignment_progress(class_id, member)
        await self.db.flush()
        account = await repo.user_by_id(self.db, member.user_id)
        if account is None:
            raise NotFoundError("Пользователь не найден")
        return self._member_out(member, account)

    async def list_class_sets(self, user: User, class_id: UUID) -> list[ClassSetOut]:
        await self._authorized(user, class_id, ClassAction.view)
        return [
            self._class_set_out(item, study_set)
            for item, study_set in await repo.list_sets(self.db, class_id)
        ]

    async def share_set(self, user: User, class_id: UUID, body: ClassSetAdd) -> ClassSetOut:
        await self._authorized(user, class_id, ClassAction.manage_materials)
        study_set = await ContentService(self.db).get_owned_set(user, body.set_id)
        existing = await repo.class_set(self.db, class_id, study_set.id)
        if existing is not None:
            raise ConflictError("Набор уже расшарен в классе")
        item = ClassSet(class_id=class_id, set_id=study_set.id, added_by=user.id)
        self.db.add(item)
        await self.db.flush()
        return self._class_set_out(item, study_set)

    async def unshare_set(self, user: User, class_id: UUID, set_id: UUID) -> None:
        await self._authorized(user, class_id, ClassAction.manage_materials)
        item = await repo.class_set(self.db, class_id, set_id)
        if item is None:
            raise NotFoundError("Набор не расшарен в классе")
        await self.db.delete(item)
        await self.db.flush()

    async def list_assignments(self, user: User, class_id: UUID) -> list[AssignmentOut]:
        await self._authorized(user, class_id, ClassAction.view)
        return [
            self._assignment_out(item) for item in await repo.list_assignments(self.db, class_id)
        ]

    async def create_assignment(
        self, user: User, class_id: UUID, body: AssignmentCreate
    ) -> AssignmentOut:
        await self._authorized(user, class_id, ClassAction.manage_assignments)
        if body.mode_required is not None and body.mode_required.value == "battle":
            raise ValidationError("Битва не может быть обязательным режимом задания")
        if body.goal_type.value in {"mastery_percent", "test_score"} and body.goal_value > 100:
            raise ValidationError("Для процента освоения и теста цель не превышает 100")
        if body.open_at is not None and body.due_at is not None and body.due_at <= body.open_at:
            raise ValidationError("Дедлайн должен быть позже времени открытия")
        if await repo.class_set(self.db, class_id, body.set_id) is None:
            raise ConflictError("Сначала расшарьте набор в классе")
        assignment = Assignment(class_id=class_id, created_by=user.id, **body.model_dump())
        self.db.add(assignment)
        await self.db.flush()
        for student in await repo.active_students(self.db, class_id):
            await repo.add_assignment_progress(self.db, assignment.id, student.user_id)
        await self.db.flush()
        return self._assignment_out(assignment)

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

    async def _seed_assignment_progress(self, class_id: UUID, member: ClassMember) -> None:
        if member.role is not ClassMemberRole.student:
            return
        for assignment in await repo.list_assignments(self.db, class_id):
            await repo.add_assignment_progress(self.db, assignment.id, member.user_id)

    @staticmethod
    def _join_out(classroom: Classroom, member: ClassMember) -> ClassroomJoinOut:
        return ClassroomJoinOut(
            class_id=classroom.id,
            class_title=classroom.title,
            status=member.status,
        )

    @staticmethod
    def _class_set_out(item: ClassSet, study_set: StudySet) -> ClassSetOut:
        return ClassSetOut(
            set_id=study_set.id,
            title=study_set.title,
            cards_count=study_set.cards_count,
            added_at=item.added_at,
        )

    @staticmethod
    def _assignment_out(assignment: Assignment) -> AssignmentOut:
        return AssignmentOut(
            id=assignment.id,
            set_id=assignment.set_id,
            title=assignment.title,
            mode_required=assignment.mode_required,
            goal_type=assignment.goal_type,
            goal_value=assignment.goal_value,
            open_at=assignment.open_at,
            due_at=assignment.due_at,
            created_at=assignment.created_at,
        )

    @staticmethod
    def _invite_out(classroom: Classroom) -> ClassroomInviteOut:
        app_url = get_settings().app_url.rstrip("/")
        return ClassroomInviteOut(
            join_code=classroom.join_code,
            join_url=f"{app_url}/classes/join?code={classroom.join_code}",
        )

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
            id=member.id,
            user_id=user.id,
            username=user.username,
            display_name=user.display_name,
            role=member.role,
            status=member.status,
            joined_at=member.joined_at,
        )
