"""Кэш синтеза речи и счётчики использования.

Кэш — **глобальный**, не пользовательский. Одно и то же слово, озвученное
кем-то однажды, бесплатно достаётся всем остальным: именно это делает
себестоимость бесплатного тарифа близкой к нулю (docs/04-limits.md, 2.2).
Квота списывается только за реальный вызов синтеза.
"""

from __future__ import annotations

import enum
from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    BigInteger,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class UsageMetric(enum.StrEnum):
    """Метрики, которые копятся за период. Проверять их будет Entitlements в E9."""

    tts_chars = "tts_chars"
    imports = "imports"
    copies = "copies"
    account_exports = "account_exports"


class TtsCache(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "tts_cache"
    __table_args__ = (
        UniqueConstraint("text_hash", name="uq_tts_cache_text_hash"),
        Index("ix_tts_cache_lang_voice", "lang", "voice"),
    )

    # sha256 от текста, языка, голоса и скорости — ключ глобального кэша.
    text_hash: Mapped[str] = mapped_column(String(64), index=True)
    lang: Mapped[str] = mapped_column(String(10))
    voice: Mapped[str] = mapped_column(String(32))
    speed: Mapped[float] = mapped_column(Float, default=1.0, server_default=text("1.0"))
    char_count: Mapped[int] = mapped_column(Integer)
    media_asset_id: Mapped[UUID] = mapped_column(
        ForeignKey("media_assets.id", ondelete="CASCADE"), index=True
    )
    hits: Mapped[int] = mapped_column(BigInteger, default=0, server_default=text("0"))
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class UsageCounter(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Расход по метрике за период.

    `period_key` — «2026-09» для месячных метрик и «2026-09-15» для суточных.
    Инкремент атомарный на стороне БД: два параллельных синтеза не должны
    потерять списание.
    """

    __tablename__ = "usage_counters"
    __table_args__ = (
        UniqueConstraint(
            "user_id", "metric", "period_key", name="uq_usage_counters_user_id_metric_period_key"
        ),
    )

    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    # Строкой, а не enum: в E9 метрик станет заметно больше, и каждая новая
    # не должна требовать ALTER TYPE на горячей таблице.
    metric: Mapped[str] = mapped_column(String(32))
    period_key: Mapped[str] = mapped_column(String(10))
    value: Mapped[int] = mapped_column(BigInteger, default=0, server_default=text("0"))
