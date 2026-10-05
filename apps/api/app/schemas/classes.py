"""Контракты первого API-среза учебных классов."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.classes import AssignmentGoalType, ClassMemberRole, ClassMemberStatus
from app.models.study import StudyMode


class ClassroomCreate(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    description: str = Field(default="", max_length=5000)
    requires_approval: bool = False


class ClassroomUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=5000)
    requires_approval: bool | None = None


class ClassroomMemberAdd(BaseModel):
    username: str = Field(min_length=3, max_length=32)
    role: ClassMemberRole = ClassMemberRole.student


class ClassroomJoin(BaseModel):
    join_code: str = Field(min_length=8, max_length=12)


class ClassroomJoinOut(BaseModel):
    class_id: UUID
    class_title: str
    status: ClassMemberStatus


class ClassroomInviteOut(BaseModel):
    join_code: str
    join_url: str


class ClassroomMemberOut(BaseModel):
    id: UUID
    user_id: UUID
    username: str
    display_name: str | None
    role: ClassMemberRole
    status: ClassMemberStatus
    joined_at: datetime


class ClassroomOut(BaseModel):
    id: UUID
    title: str
    description: str
    join_code: str
    requires_approval: bool
    archived_at: datetime | None
    my_role: ClassMemberRole
    created_at: datetime
    updated_at: datetime


class ClassroomDetailOut(ClassroomOut):
    members: list[ClassroomMemberOut]


class ClassSetAdd(BaseModel):
    set_id: UUID


class ClassSetOut(BaseModel):
    set_id: UUID
    title: str
    cards_count: int
    added_at: datetime


class AssignmentCreate(BaseModel):
    set_id: UUID
    title: str = Field(min_length=1, max_length=160)
    mode_required: StudyMode | None = None
    goal_type: AssignmentGoalType
    goal_value: int = Field(ge=1, le=100_000)
    open_at: datetime | None = None
    due_at: datetime | None = None


class AssignmentOut(BaseModel):
    id: UUID
    set_id: UUID
    title: str
    mode_required: StudyMode | None
    goal_type: AssignmentGoalType
    goal_value: int
    open_at: datetime | None
    due_at: datetime | None
    created_at: datetime
