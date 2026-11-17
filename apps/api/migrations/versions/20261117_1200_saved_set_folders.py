"""Папки сохранённых наборов в личной библиотеке."""

import sqlalchemy as sa
from alembic import op

revision = "saved_set_folders"
down_revision = "public_materials"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "saved_set_folders",
        sa.Column(
            "user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
        ),
        sa.Column(
            "set_id",
            sa.Uuid(),
            sa.ForeignKey("study_sets.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "folder_id", sa.Uuid(), sa.ForeignKey("folders.id", ondelete="SET NULL"), nullable=True
        ),
    )
    op.create_index("ix_saved_set_folders_folder_id", "saved_set_folders", ["folder_id"])


def downgrade() -> None:
    op.drop_table("saved_set_folders")
