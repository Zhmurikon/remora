"""Публичные учебные материалы и добровольные письменные упражнения."""

import sqlalchemy as sa
from alembic import op

revision = "public_materials"
down_revision = "ebbb0465edc7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    recommended = """'["choice", "recall"]'::jsonb"""
    op.alter_column("user_settings", "learn_question_types", server_default=sa.text(recommended))
    for table, column in (
        ("user_settings", "learn_question_types"),
        ("user_set_learn_settings", "question_types"),
    ):
        op.execute(f"""UPDATE {table}
            SET {column} = CASE WHEN {column} - 'typing' = '[]'::jsonb THEN {recommended}
                                ELSE {column} - 'typing' END
            WHERE {column} ? 'typing'""")
    op.execute(f"""UPDATE study_sessions SET config = jsonb_set(config,
        '{{bot_learn_question_types}}',
        CASE WHEN (config->'bot_learn_question_types') - 'typing' = '[]'::jsonb
             THEN {recommended} ELSE (config->'bot_learn_question_types') - 'typing' END)
        WHERE mode = 'learn' AND status = 'active' AND (config->'bot_learn_question_types') ? 'typing'""")

    op.alter_column("courses", "is_published", server_default=sa.true())
    op.add_column(
        "generation_jobs",
        sa.Column("is_public", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.execute(
        "UPDATE study_sets SET visibility = 'public', updated_at = now() WHERE visibility <> 'public'"
    )
    op.execute("""UPDATE courses SET is_published = true, is_listed = true,
        published_at = coalesce(published_at, now()), updated_at = now()
        WHERE NOT is_published OR NOT is_listed OR published_at IS NULL""")
    op.execute("""INSERT INTO course_search_sync (course_id)
        SELECT id FROM courses ON CONFLICT (course_id)
        DO UPDATE SET version = course_search_sync.version + 1, requested_at = now()""")
    # Подписки привязаны к снимкам версий каталога, включая снятые с продажи.
    op.execute("""UPDATE plans SET features = jsonb_set(features, '{features,materials.private}',
        to_jsonb(code IN ('plus','pro'))) WHERE code IN ('free','plus','pro')""")


def downgrade() -> None:
    # Прежние индивидуальные значения после массового перехода восстанавливаются из бэкапа.
    op.execute("""UPDATE plans SET features = features #- '{features,materials.private}'""")
    op.drop_column("generation_jobs", "is_public")
    op.alter_column("courses", "is_published", server_default=sa.false())
    op.alter_column(
        "user_settings",
        "learn_question_types",
        server_default=sa.text("""'["choice", "typing", "recall"]'::jsonb"""),
    )
