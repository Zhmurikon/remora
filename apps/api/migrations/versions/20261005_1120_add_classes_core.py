"""add classes core

Revision ID: classes_core
Revises: keep_search_tasks
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "classes_core"
down_revision: str | None = "keep_search_tasks"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    class_member_role = postgresql.ENUM(
        "teacher", "assistant", "student", name="classmemberrole", create_type=False
    )
    class_member_status = postgresql.ENUM(
        "active", "pending", "left", name="classmemberstatus", create_type=False
    )
    assignment_goal_type = postgresql.ENUM(
        "mastery_percent", "cards_count", "test_score", name="assignmentgoaltype", create_type=False
    )
    assignment_progress_status = postgresql.ENUM(
        "not_started",
        "in_progress",
        "done",
        "late",
        name="assignmentprogressstatus",
        create_type=False,
    )
    class_member_role.create(op.get_bind(), checkfirst=True)
    class_member_status.create(op.get_bind(), checkfirst=True)
    assignment_goal_type.create(op.get_bind(), checkfirst=True)
    assignment_progress_status.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "classes",
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("description", sa.Text(), server_default=sa.text("''"), nullable=False),
        sa.Column("join_code", sa.String(length=12), nullable=False),
        sa.Column("school_id", sa.Uuid(), nullable=True),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "settings",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["owner_id"], ["users.id"], name=op.f("fk_classes_owner_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_classes")),
        sa.UniqueConstraint("join_code", name=op.f("uq_classes_join_code")),
    )
    op.create_index(op.f("ix_classes_owner_id"), "classes", ["owner_id"], unique=False)
    op.create_index(op.f("ix_classes_join_code"), "classes", ["join_code"], unique=False)
    op.create_index(op.f("ix_classes_school_id"), "classes", ["school_id"], unique=False)
    op.create_index(op.f("ix_classes_archived_at"), "classes", ["archived_at"], unique=False)
    op.create_index("ix_classes_owner_id_archived_at", "classes", ["owner_id", "archived_at"])

    op.create_table(
        "class_members",
        sa.Column("class_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("role", class_member_role, nullable=False),
        sa.Column(
            "status", class_member_status, server_default=sa.text("'active'"), nullable=False
        ),
        sa.Column(
            "joined_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["class_id"],
            ["classes.id"],
            name=op.f("fk_class_members_class_id_classes"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_class_members_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_class_members")),
        sa.UniqueConstraint("class_id", "user_id", name="uq_class_members_class_id_user_id"),
    )
    op.create_index(op.f("ix_class_members_class_id"), "class_members", ["class_id"])
    op.create_index(op.f("ix_class_members_user_id"), "class_members", ["user_id"])
    op.create_index("ix_class_members_class_id_status", "class_members", ["class_id", "status"])
    op.create_index("ix_class_members_user_id_status", "class_members", ["user_id", "status"])

    op.create_table(
        "class_sets",
        sa.Column("class_id", sa.Uuid(), nullable=False),
        sa.Column("set_id", sa.Uuid(), nullable=False),
        sa.Column("added_by", sa.Uuid(), nullable=False),
        sa.Column(
            "added_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["added_by"],
            ["users.id"],
            name=op.f("fk_class_sets_added_by_users"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["class_id"],
            ["classes.id"],
            name=op.f("fk_class_sets_class_id_classes"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["set_id"],
            ["study_sets.id"],
            name=op.f("fk_class_sets_set_id_study_sets"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_class_sets")),
        sa.UniqueConstraint("class_id", "set_id", name="uq_class_sets_class_id_set_id"),
    )
    op.create_index(op.f("ix_class_sets_class_id"), "class_sets", ["class_id"])
    op.create_index(op.f("ix_class_sets_set_id"), "class_sets", ["set_id"])
    op.create_index(op.f("ix_class_sets_added_by"), "class_sets", ["added_by"])

    op.create_table(
        "assignments",
        sa.Column("class_id", sa.Uuid(), nullable=False),
        sa.Column("set_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column(
            "mode_required", postgresql.ENUM(name="studymode", create_type=False), nullable=True
        ),
        sa.Column("goal_type", assignment_goal_type, nullable=False),
        sa.Column("goal_value", sa.Integer(), nullable=False),
        sa.Column("open_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("goal_value > 0", name=op.f("ck_assignments_goal_value_positive")),
        sa.ForeignKeyConstraint(
            ["class_id"],
            ["classes.id"],
            name=op.f("fk_assignments_class_id_classes"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["users.id"],
            name=op.f("fk_assignments_created_by_users"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["set_id"],
            ["study_sets.id"],
            name=op.f("fk_assignments_set_id_study_sets"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_assignments")),
    )
    op.create_index(op.f("ix_assignments_class_id"), "assignments", ["class_id"])
    op.create_index(op.f("ix_assignments_set_id"), "assignments", ["set_id"])
    op.create_index(op.f("ix_assignments_due_at"), "assignments", ["due_at"])
    op.create_index(op.f("ix_assignments_created_by"), "assignments", ["created_by"])
    op.create_index("ix_assignments_class_id_due_at", "assignments", ["class_id", "due_at"])

    op.create_table(
        "assignment_progress",
        sa.Column("assignment_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("progress_value", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_activity_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "status",
            assignment_progress_status,
            server_default=sa.text("'not_started'"),
            nullable=False,
        ),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["assignment_id"],
            ["assignments.id"],
            name=op.f("fk_assignment_progress_assignment_id_assignments"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_assignment_progress_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_assignment_progress")),
        sa.UniqueConstraint(
            "assignment_id", "user_id", name="uq_assignment_progress_assignment_id_user_id"
        ),
    )
    op.create_index(
        op.f("ix_assignment_progress_assignment_id"), "assignment_progress", ["assignment_id"]
    )
    op.create_index(op.f("ix_assignment_progress_user_id"), "assignment_progress", ["user_id"])
    op.create_index(
        "ix_assignment_progress_assignment_id_status",
        "assignment_progress",
        ["assignment_id", "status"],
    )


def downgrade() -> None:
    op.drop_index("ix_assignment_progress_assignment_id_status", table_name="assignment_progress")
    op.drop_index(op.f("ix_assignment_progress_user_id"), table_name="assignment_progress")
    op.drop_index(op.f("ix_assignment_progress_assignment_id"), table_name="assignment_progress")
    op.drop_table("assignment_progress")
    op.drop_index("ix_assignments_class_id_due_at", table_name="assignments")
    op.drop_index(op.f("ix_assignments_created_by"), table_name="assignments")
    op.drop_index(op.f("ix_assignments_due_at"), table_name="assignments")
    op.drop_index(op.f("ix_assignments_set_id"), table_name="assignments")
    op.drop_index(op.f("ix_assignments_class_id"), table_name="assignments")
    op.drop_table("assignments")
    op.drop_index(op.f("ix_class_sets_added_by"), table_name="class_sets")
    op.drop_index(op.f("ix_class_sets_set_id"), table_name="class_sets")
    op.drop_index(op.f("ix_class_sets_class_id"), table_name="class_sets")
    op.drop_table("class_sets")
    op.drop_index("ix_class_members_user_id_status", table_name="class_members")
    op.drop_index("ix_class_members_class_id_status", table_name="class_members")
    op.drop_index(op.f("ix_class_members_user_id"), table_name="class_members")
    op.drop_index(op.f("ix_class_members_class_id"), table_name="class_members")
    op.drop_table("class_members")
    op.drop_index("ix_classes_owner_id_archived_at", table_name="classes")
    op.drop_index(op.f("ix_classes_archived_at"), table_name="classes")
    op.drop_index(op.f("ix_classes_school_id"), table_name="classes")
    op.drop_index(op.f("ix_classes_join_code"), table_name="classes")
    op.drop_index(op.f("ix_classes_owner_id"), table_name="classes")
    op.drop_table("classes")
    op.execute("DROP TYPE assignmentprogressstatus")
    op.execute("DROP TYPE assignmentgoaltype")
    op.execute("DROP TYPE classmemberstatus")
    op.execute("DROP TYPE classmemberrole")
