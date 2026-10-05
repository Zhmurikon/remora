"""Единая матрица прав учебного класса."""

from __future__ import annotations

import enum

from app.models.classes import ClassMemberRole


class ClassAction(enum.Enum):
    view = "view"
    edit_class = "edit_class"
    manage_members = "manage_members"
    manage_materials = "manage_materials"
    manage_assignments = "manage_assignments"
    view_reports = "view_reports"


_ALLOWED_ROLES: dict[ClassAction, frozenset[ClassMemberRole]] = {
    ClassAction.view: frozenset(
        {ClassMemberRole.teacher, ClassMemberRole.assistant, ClassMemberRole.student}
    ),
    ClassAction.edit_class: frozenset({ClassMemberRole.teacher}),
    ClassAction.manage_members: frozenset({ClassMemberRole.teacher}),
    ClassAction.manage_materials: frozenset({ClassMemberRole.teacher, ClassMemberRole.assistant}),
    ClassAction.manage_assignments: frozenset({ClassMemberRole.teacher, ClassMemberRole.assistant}),
    ClassAction.view_reports: frozenset({ClassMemberRole.teacher, ClassMemberRole.assistant}),
}


def allows(role: ClassMemberRole, action: ClassAction) -> bool:
    """Проверяет роль только через матрицу, а не через условия на эндпоинтах."""
    return role in _ALLOWED_ROLES[action]
