"""Синтез речи с глобальным кэшем.

Экономика режима «Аудирование» держится на одном решении: кэш общий для всех
пользователей и ключуется по sha256(текст + язык + голос + скорость). Слово
«apple», озвученное однажды, больше никогда никому не стоит ни копейки и не
трогает месячную квоту (docs/04-limits.md, 2.2).

Провайдер подключается по конфигу. Без ключа синтез выключен и отвечает
доменной ошибкой `TTS_UNAVAILABLE`: обучение не должно зависеть от внешнего
сервиса, поэтому режимы продолжают работать, просто без озвучки.
"""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime
from typing import Protocol
from uuid import UUID, uuid4

import httpx
import structlog
from fastapi import status
from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.errors import AppError, ConflictError
from app.core.storage import get_audio_storage
from app.models.content import MediaAsset, MediaKind, MediaSource, MediaStatus
from app.models.tts import TtsCache, UsageCounter, UsageMetric
from app.models.user import User

log = structlog.get_logger()

MIME = "audio/mpeg"
AUDIO_FORMAT = "mp3"

# Голоса по умолчанию. Бесплатный тариф получает один голос на язык —
# выбор остальных появится вместе с Entitlements в E9.
DEFAULT_VOICES: dict[str, str] = {
    "ru": "alena",
    "en": "john",
    "de": "lea",
    "kk": "amira",
    "uz": "nigora",
}
FALLBACK_VOICE = "alena"

MIN_SPEED = 0.5
MAX_SPEED = 2.0


class TtsUnavailableError(AppError):
    """Синтез не настроен или внешний сервис недоступен."""

    code = "TTS_UNAVAILABLE"
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    message = "Озвучка сейчас недоступна"


class TtsProvider(Protocol):
    async def synthesize(self, text: str, *, lang: str, voice: str, speed: float) -> bytes: ...


class DisabledProvider:
    """Заглушка на окружениях без ключа SpeechKit."""

    async def synthesize(self, text: str, *, lang: str, voice: str, speed: float) -> bytes:
        raise TtsUnavailableError("Синтез речи не настроен на этом окружении")


class YandexSpeechKitProvider:
    """Яндекс SpeechKit v1. Отдаёт готовый mp3, его и кладём в хранилище."""

    endpoint = "https://tts.api.cloud.yandex.net/speech/v1/tts:synthesize"

    def __init__(self, api_key: str, folder_id: str, timeout: float) -> None:
        self.api_key = api_key
        self.folder_id = folder_id
        self.timeout = timeout

    async def synthesize(self, text: str, *, lang: str, voice: str, speed: float) -> bytes:
        payload = {
            "text": text,
            "lang": _speechkit_lang(lang),
            "voice": voice,
            "speed": f"{speed:.2f}",
            "format": AUDIO_FORMAT,
            "folderId": self.folder_id,
        }
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    self.endpoint,
                    data=payload,
                    headers={"Authorization": f"Api-Key {self.api_key}"},
                )
        except httpx.HTTPError as error:
            log.warning("tts.request_failed", error=str(error))
            raise TtsUnavailableError("Сервис озвучки не ответил") from error

        if response.status_code != 200:
            log.warning("tts.rejected", status=response.status_code, body=response.text[:200])
            raise TtsUnavailableError("Сервис озвучки вернул ошибку")
        return response.content


def build_provider(settings: Settings) -> TtsProvider:
    if (
        settings.tts_provider == "yandex"
        and settings.yandex_speechkit_api_key
        and settings.yandex_speechkit_folder_id
    ):
        return YandexSpeechKitProvider(
            settings.yandex_speechkit_api_key.get_secret_value(),
            settings.yandex_speechkit_folder_id,
            settings.tts_request_timeout_seconds,
        )
    return DisabledProvider()


class TtsService:
    def __init__(self, db: AsyncSession, provider: TtsProvider | None = None) -> None:
        self.db = db
        self.settings = get_settings()
        self.provider = provider or build_provider(self.settings)

    @property
    def available(self) -> bool:
        return not isinstance(self.provider, DisabledProvider)

    def resolve_voice(self, lang: str, requested: str | None = None) -> str:
        return requested or DEFAULT_VOICES.get(lang[:2].lower(), FALLBACK_VOICE)

    async def speak(
        self,
        user: User,
        text: str,
        *,
        lang: str,
        voice: str | None = None,
        speed: float = 1.0,
    ) -> tuple[MediaAsset, bool]:
        """Возвращает готовое аудио и признак попадания в кэш."""
        clean = " ".join(text.split())
        if not clean:
            raise ConflictError("Нечего озвучивать")
        if len(clean) > self.settings.tts_max_chars_per_request:
            raise ConflictError(
                f"Слишком длинный текст: максимум "
                f"{self.settings.tts_max_chars_per_request} символов"
            )

        resolved_voice = self.resolve_voice(lang, voice)
        speed = min(max(speed, MIN_SPEED), MAX_SPEED)
        digest = cache_key(clean, lang=lang, voice=resolved_voice, speed=speed)

        cached = await self._from_cache(digest)
        if cached is not None:
            return cached, True

        if not self.available:
            raise TtsUnavailableError()

        payload = await self.provider.synthesize(
            clean, lang=lang, voice=resolved_voice, speed=speed
        )
        asset = await self._store(payload, lang=lang, voice=resolved_voice)
        await self._remember(
            digest, asset, lang=lang, voice=resolved_voice, speed=speed, chars=len(clean)
        )
        # Квота тратится только на реальный синтез — попадание в кэш бесплатно.
        await self.consume(user, UsageMetric.tts_chars, len(clean))
        return asset, False

    def download_url(self, asset: MediaAsset) -> str:
        return get_audio_storage().download_url(
            asset.s3_key, self.settings.media_download_ttl_seconds
        )

    async def _from_cache(self, digest: str) -> MediaAsset | None:
        result = await self.db.execute(
            select(TtsCache, MediaAsset)
            .join(MediaAsset, MediaAsset.id == TtsCache.media_asset_id)
            .where(TtsCache.text_hash == digest, MediaAsset.status == MediaStatus.ready)
        )
        row = result.one_or_none()
        if row is None:
            return None
        entry: TtsCache = row[0]
        asset: MediaAsset = row[1]
        await self.db.execute(
            update(TtsCache)
            .where(TtsCache.id == entry.id)
            .values(hits=TtsCache.hits + 1, last_used_at=datetime.now(tz=UTC))
        )
        return asset

    async def _store(self, payload: bytes, *, lang: str, voice: str) -> MediaAsset:
        asset_id = uuid4()
        key = f"tts/{lang[:2].lower()}/{voice}/{asset_id}.{AUDIO_FORMAT}"
        await get_audio_storage().put(key, payload, MIME)
        asset = MediaAsset(
            id=asset_id,
            # Синтезированное аудио — общий ресурс платформы, а не пользователя:
            # владельца нет, иначе удаление аккаунта унесло бы чужой кэш.
            owner_id=None,
            kind=MediaKind.audio,
            s3_key=key,
            mime=MIME,
            size_bytes=len(payload),
            checksum=hashlib.sha256(payload).hexdigest(),
            source=MediaSource.tts,
            status=MediaStatus.ready,
        )
        self.db.add(asset)
        await self.db.flush()
        return asset

    async def _remember(
        self,
        digest: str,
        asset: MediaAsset,
        *,
        lang: str,
        voice: str,
        speed: float,
        chars: int,
    ) -> None:
        # Гонка двух одновременных синтезов одного слова разрешается в пользу
        # первого: второй просто не создаёт вторую запись кэша.
        await self.db.execute(
            insert(TtsCache)
            .values(
                id=uuid4(),
                text_hash=digest,
                lang=lang,
                voice=voice,
                speed=speed,
                char_count=chars,
                media_asset_id=asset.id,
                hits=1,
                last_used_at=datetime.now(tz=UTC),
            )
            .on_conflict_do_nothing(constraint="uq_tts_cache_text_hash")
        )

    async def consume(self, user: User, metric: UsageMetric, amount: int) -> int:
        """Атомарный инкремент счётчика. Проверку лимита добавит Entitlements в E9."""
        period = _period_key(metric)
        statement = (
            insert(UsageCounter)
            .values(
                id=uuid4(),
                user_id=user.id,
                metric=metric.value,
                period_key=period,
                value=amount,
            )
            .on_conflict_do_update(
                constraint="uq_usage_counters_user_id_metric_period_key",
                set_={"value": UsageCounter.value + amount},
            )
            .returning(UsageCounter.value)
        )
        result = await self.db.execute(statement)
        return int(result.scalar_one())

    async def usage(self, user_id: UUID, metric: UsageMetric) -> int:
        value = await self.db.scalar(
            select(UsageCounter.value).where(
                UsageCounter.user_id == user_id,
                UsageCounter.metric == metric.value,
                UsageCounter.period_key == _period_key(metric),
            )
        )
        return int(value or 0)


def cache_key(text: str, *, lang: str, voice: str, speed: float) -> str:
    raw = f"{text}\x00{lang.lower()}\x00{voice}\x00{speed:.2f}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _period_key(metric: UsageMetric) -> str:
    now = datetime.now(tz=UTC)
    # Символы TTS считаются за месяц, остальное — за сутки (docs/04-limits.md).
    if metric is UsageMetric.tts_chars:
        return now.strftime("%Y-%m")
    return now.strftime("%Y-%m-%d")


def _speechkit_lang(lang: str) -> str:
    return {
        "ru": "ru-RU",
        "en": "en-US",
        "de": "de-DE",
        "kk": "kk-KK",
        "uz": "uz-UZ",
    }.get(lang[:2].lower(), "ru-RU")
