"""public sets by default

Revision ID: public_sets_default
Revises: bot_message_id
"""

from collections.abc import Sequence

from alembic import op

revision: str = "public_sets_default"
down_revision: str | None = "bot_message_id"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TABLE study_sets ALTER COLUMN visibility SET DEFAULT 'public'")
    op.execute(
        """
        UPDATE study_sets AS sets
        SET visibility = 'public'
        FROM course_articles AS articles
        JOIN course_sections AS sections ON sections.id = articles.section_id
        JOIN courses ON courses.id = sections.course_id
        WHERE sets.id = articles.set_id AND courses.is_published = true
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE study_sets ALTER COLUMN visibility SET DEFAULT 'private'")
