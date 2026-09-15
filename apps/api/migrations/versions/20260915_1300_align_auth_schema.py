"""align auth constraints and indexes with ORM

Revision ID: c71d8e4a930f
Revises: b4f9c2a617de
Create Date: 2026-09-15 13:00:00.000000+00:00
"""

from collections.abc import Sequence

from alembic import op

revision: str = "c71d8e4a930f"
down_revision: str | None = "b4f9c2a617de"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _replace_with_unique_index(
    table: str,
    column: str,
    *,
    constraint: str | None = None,
) -> None:
    if constraint:
        op.drop_constraint(constraint, table, type_="unique")
    op.drop_index(f"ix_{table}_{column}", table_name=table)
    op.create_index(f"ix_{table}_{column}", table, [column], unique=True)


def _replace_with_constraint_and_index(
    table: str,
    column: str,
    *,
    constraint: str | None = None,
) -> None:
    op.drop_index(f"ix_{table}_{column}", table_name=table)
    op.create_index(f"ix_{table}_{column}", table, [column], unique=False)
    if constraint:
        op.create_unique_constraint(constraint, table, [column])


def upgrade() -> None:
    _replace_with_unique_index(
        "users", "email", constraint="uq_users_email"
    )
    _replace_with_unique_index("users", "username")
    _replace_with_unique_index(
        "user_settings", "user_id", constraint="uq_user_settings_user_id"
    )
    _replace_with_unique_index(
        "refresh_tokens", "token_hash", constraint="uq_refresh_tokens_token_hash"
    )
    _replace_with_unique_index(
        "action_tokens", "token_hash", constraint="uq_action_tokens_token_hash"
    )


def downgrade() -> None:
    _replace_with_constraint_and_index(
        "action_tokens", "token_hash", constraint="uq_action_tokens_token_hash"
    )
    _replace_with_constraint_and_index(
        "refresh_tokens", "token_hash", constraint="uq_refresh_tokens_token_hash"
    )
    _replace_with_constraint_and_index(
        "user_settings", "user_id", constraint="uq_user_settings_user_id"
    )
    _replace_with_constraint_and_index("users", "username")
    _replace_with_constraint_and_index(
        "users", "email", constraint="uq_users_email"
    )
