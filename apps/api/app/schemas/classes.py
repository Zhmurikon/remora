"""Контракты первого API-среза учебных классов."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.classes import ClassMemberRole, ClassMemberStatus


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


class ClassroomMemberOut(BaseModel):
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
