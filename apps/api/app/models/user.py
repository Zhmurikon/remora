"""Модели идентичности: пользователи, настройки, OAuth, токены, согласия."""

from __future__ import annotations

import enum
from datetime import UTC, date, datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class UserRole(enum.Enum):
    user = "user"
    teacher = "teacher"
    moderator = "moderator"
    admin = "admin"


class UserStatus(enum.Enum):
    active = "active"
    suspended = "suspended"
    deleted = "deleted"


class ConsentKind(enum.Enum):
    pdn = "pdn"
    offer = "offer"
    marketing = "marketing"
    guardian = "guardian"


class User(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "users"

    email: Mapped[str | None] = mapped_column(String(320), unique=True, index=True)
    password_hash: Mapped[str | None]
    username: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    display_name: Mapped[str | None] = mapped_column(String(64))
    avatar_url: Mapped[str | None] = mapped_column(String(512))
    role: Mapped[UserRole] = mapped_column(
        server_default=text("'user'"), default=UserRole.user
    )
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    birth_date: Mapped[date | None]
    locale: Mapped[str] = mapped_column(
        String(5), default="ru", server_default=text("'ru'")
    )
    timezone: Mapped[str] = mapped_column(
        String(40), default="Europe/Moscow", server_default=text("'Europe/Moscow'")
    )
    status: Mapped[UserStatus] = mapped_column(
        server_default=text("'active'"), default=UserStatus.active
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    settings: Mapped[UserSettings | None] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    refresh_tokens: Mapped[list[RefreshToken]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    action_tokens: Mapped[list[ActionToken]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    oauth_accounts: Mapped[list[OauthAccount]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )

    @property
    def requires_guardian_consent(self) -> bool:
        """Младше 14 лет — нужно согласие законного представителя."""
        if self.birth_date is None:
            return False
        from datetime import date as _date

        today = _date.today()
        age = today.year - self.birth_date.year - (
            1 if (today.month, today.day) < (self.birth_date.month, self.birth_date.day) else 0
        )
        return age < 14


class UserSettings(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "user_settings"

    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True
    )
    daily_goal_cards: Mapped[int] = mapped_column(default=20, server_default=text("20"))
    fsrs_desired_retention: Mapped[float] = mapped_column(
        default=0.90, server_default=text("0.9")
    )
    fsrs_max_interval_days: Mapped[int] = mapped_column(
        default=365, server_default=text("365")
    )
    new_cards_per_day: Mapped[int] = mapped_column(default=20, server_default=text("20"))
    reviews_per_day: Mapped[int] = mapped_column(default=200, server_default=text("200"))
    # Строгость проверки ответов в режимах «Письмо», «Тест» и «Аудирование».
    answer_strictness: Mapped[str] = mapped_column(
        String(10), default="moderate", server_default=text("'moderate'")
    )
    # Настройки «Заучивания» храним отдельно от FSRS: они меняют форму сессии,
    # но не ограничивают доступ к карточкам и повторениям.
    learn_question_types: Mapped[list[str]] = mapped_column(
        JSONB,
        default=lambda: ["choice", "typing", "recall"],
        server_default=text("'[\"choice\", \"typing\", \"recall\"]'::jsonb"),
    )
    learn_successes_required: Mapped[int] = mapped_column(default=1, server_default=text("1"))
    learn_typing_check: Mapped[str] = mapped_column(
        String(12), default="automatic", server_default=text("'automatic'")
    )
    learn_match_percent: Mapped[int] = mapped_column(default=90, server_default=text("90"))
    tts_voice_preference: Mapped[str | None] = mapped_column(String(32))
    notification_channels: Mapped[dict[str, Any]] = mapped_column(
        JSONB, default=dict, server_default=text("'{}'::jsonb")
    )
    theme: Mapped[str] = mapped_column(
        String(10), default="system", server_default=text("'system'")
    )

    user: Mapped[User] = relationship(back_populates="settings")


class RefreshToken(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "refresh_tokens"

    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    token_hash: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    family_id: Mapped[UUID] = mapped_column(index=True, default=uuid4)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    user_agent: Mapped[str | None] = mapped_column(String(512))
    ip: Mapped[str | None] = mapped_column(String(45))

    user: Mapped[User] = relationship(back_populates="refresh_tokens")


class ActionToken(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Одноразовая ссылка для чувствительного действия с аккаунтом."""

    __tablename__ = "action_tokens"

    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    purpose: Mapped[str] = mapped_column(String(32), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    user: Mapped[User] = relationship(back_populates="action_tokens")


class OauthAccount(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "oauth_accounts"
    __table_args__ = (
        UniqueConstraint(
            "provider",
            "provider_user_id",
            name="uq_oauth_accounts_provider_provider_user_id",
        ),
    )

    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    provider: Mapped[str] = mapped_column(String(16), index=True)
    provider_user_id: Mapped[str] = mapped_column(String(128), index=True)
    raw_profile: Mapped[dict[str, Any]] = mapped_column(
        JSONB, default=dict, server_default=text("'{}'::jsonb")
    )

    user: Mapped[User] = relationship(back_populates="oauth_accounts")


class Consent(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "consents"

    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[ConsentKind] = mapped_column(index=True)
    version: Mapped[str] = mapped_column(String(16))
    accepted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), default=lambda: datetime.now(tz=UTC)
    )
    ip: Mapped[str | None] = mapped_column(String(45))
