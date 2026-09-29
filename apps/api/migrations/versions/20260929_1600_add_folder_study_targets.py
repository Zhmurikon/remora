"""Папки сохранённых курсов и учебные сессии по папке.

Revision ID: folder_study_targets
Revises: course_study_sessions
"""

from collections.abc import Sequence
from uuid import uuid4

import sqlalchemy as sa
from alembic import op

revision: str = "folder_study_targets"
down_revision: str | None = "course_study_sessions"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("library_saves", sa.Column("folder_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        op.f("fk_library_saves_folder_id_folders"),
        "library_saves",
        "folders",
        ["folder_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(op.f("ix_library_saves_folder_id"), "library_saves", ["folder_id"])
    connection = op.get_bind()
    rows = connection.execute(
        sa.text(
            """
            SELECT ls.id, ls.user_id, left(c.title, 100) AS title,
                   coalesce((SELECT max(f.position) + 1 FROM folders f WHERE f.owner_id = ls.user_id), 0)
                   + row_number() OVER (PARTITION BY ls.user_id ORDER BY ls.created_at) - 1 AS position
            FROM library_saves ls
            JOIN courses c ON c.id = ls.course_id
            WHERE ls.folder_id IS NULL
            """
        )
    ).all()
    for save_id, user_id, title, position in rows:
        folder_id = uuid4()
        connection.execute(
            sa.text(
                "INSERT INTO folders (id, owner_id, parent_id, title, color, position) "
                "VALUES (:id, :owner_id, NULL, :title, 'violet', :position)"
            ),
            {
                "id": folder_id,
                "owner_id": user_id,
                "title": title,
                "position": position,
            },
        )
        connection.execute(
            sa.text("UPDATE library_saves SET folder_id = :folder_id WHERE id = :save_id"),
            {"folder_id": folder_id, "save_id": save_id},
        )

    op.drop_constraint(
        op.f("ck_study_sessions_exactly_one_target"), "study_sessions", type_="check"
    )
    op.add_column("study_sessions", sa.Column("folder_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        op.f("fk_study_sessions_folder_id_folders"),
        "study_sessions",
        "folders",
        ["folder_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(op.f("ix_study_sessions_folder_id"), "study_sessions", ["folder_id"])
    op.create_index(
        "ix_study_sessions_user_id_folder_id_status",
        "study_sessions",
        ["user_id", "folder_id", "status"],
    )
    op.create_check_constraint(
        op.f("ck_study_sessions_exactly_one_target"),
        "study_sessions",
        "num_nonnulls(set_id, course_id, folder_id) = 1",
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("ck_study_sessions_exactly_one_target"), "study_sessions", type_="check"
    )
    op.drop_index("ix_study_sessions_user_id_folder_id_status", table_name="study_sessions")
    op.drop_index(op.f("ix_study_sessions_folder_id"), table_name="study_sessions")
    op.drop_constraint(
        op.f("fk_study_sessions_folder_id_folders"), "study_sessions", type_="foreignkey"
    )
    op.drop_column("study_sessions", "folder_id")
    op.create_check_constraint(
        op.f("ck_study_sessions_exactly_one_target"),
        "study_sessions",
        "num_nonnulls(set_id, course_id) = 1",
    )

    op.drop_index(op.f("ix_library_saves_folder_id"), table_name="library_saves")
    op.drop_constraint(
        op.f("fk_library_saves_folder_id_folders"), "library_saves", type_="foreignkey"
    )
    op.drop_column("library_saves", "folder_id")
