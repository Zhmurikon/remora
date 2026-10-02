"""Репозиторий привязанных OAuth-аккаунтов."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import OauthAccount, User, UserSettings


async def get_account_with_user(
    db: AsyncSession, *, provider: str, provider_user_id: str
) -> tuple[OauthAccount, User] | None:
    result = await db.execute(
        select(OauthAccount, User)
        .join(User, User.id == OauthAccount.user_id)
        .where(
            OauthAccount.provider == provider,
            OauthAccount.provider_user_id == provider_user_id,
        )
    )
    row = result.one_or_none()
    if row is None:
        return None
    return row[0], row[1]


async def get_user_by_normalized_email(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(
        select(User).where(func.lower(User.email) == email.strip().casefold()).with_for_update()
    )
    return result.scalar_one_or_none()


async def create_oauth_user(
    db: AsyncSession,
    *,
    email: str,
    username: str,
    display_name: str | None,
    avatar_url: str | None,
) -> User:
    user = User(
        email=email,
        password_hash=None,
        username=username,
        display_name=display_name,
        avatar_url=avatar_url,
        email_verified_at=datetime.now(tz=UTC),
    )
    db.add(user)
    await db.flush()
    db.add(UserSettings(user_id=user.id))
    await db.flush()
    return user


async def create_account(
    db: AsyncSession,
    *,
    user: User,
    provider: str,
    provider_user_id: str,
    raw_profile: dict[str, Any],
) -> OauthAccount:
    account = OauthAccount(
        user_id=user.id,
        provider=provider,
        provider_user_id=provider_user_id,
        raw_profile=raw_profile,
    )
    db.add(account)
    await db.flush()
    return account


async def update_account_profile(
    db: AsyncSession, account: OauthAccount, raw_profile: dict[str, Any]
) -> None:
    account.raw_profile = raw_profile
    await db.flush()


async def fill_missing_profile(
    db: AsyncSession,
    user: User,
    *,
    verify_email: bool,
    display_name: str | None,
    avatar_url: str | None,
) -> None:
    if verify_email and user.email_verified_at is None:
        user.email_verified_at = datetime.now(tz=UTC)
    if user.display_name is None and display_name:
        user.display_name = display_name
    if user.avatar_url is None and avatar_url:
        user.avatar_url = avatar_url
    await db.flush()
