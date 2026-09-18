"""Настройки приложения. Единственное место, где читается окружение."""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, PostgresDsn, RedisDsn, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parents[4]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ROOT_DIR / ".env",
        env_file_encoding="utf-8",
        env_nested_delimiter="__",
        extra="ignore",
    )

    # Приложение
    environment: Literal["local", "staging", "production"] = "local"
    debug: bool = False
    tg_bot_username: str = ""
    vk_group_id: int = 0
    bot_tg_service_token: SecretStr = SecretStr("")
    bot_vk_service_token: SecretStr = SecretStr("")
    api_v1_prefix: str = "/api/v1"
    project_name: str = "Remora API"

    # Секреты
    secret_key: str = Field(min_length=32)

    # Инфраструктура
    database_url: PostgresDsn
    redis_url: RedisDsn
    meili_url: str = "http://localhost:7700"
    meili_master_key: SecretStr = SecretStr("remora-dev-master-key")
    meili_index: str = Field(default="courses", pattern=r"^[a-zA-Z0-9_-]+$")
    meili_timeout_seconds: float = Field(default=10, gt=0, le=60)

    # S3-совместимое хранилище медиа
    s3_endpoint: str = "http://localhost:9100"
    s3_access_key: str = "remora"
    s3_secret_key: SecretStr = SecretStr("remora-dev-secret")
    s3_bucket_media: str = "remora-media"
    s3_bucket_audio: str = "remora-audio"
    media_upload_ttl_seconds: int = 900
    media_download_ttl_seconds: int = 3600
    account_export_ttl_hours: int = 24
    media_image_max_size_bytes: int = 10 * 1024 * 1024
    media_image_max_pixels: int = 25_000_000

    # Ограничения чувствительных запросов на один IP и аккаунт
    rate_limit_register: int = 5
    rate_limit_login: int = 10
    rate_limit_password_reset: int = 5
    rate_limit_window_seconds: int = 900
    rate_limit_password_reset_window_seconds: int = 3600

    # CORS: адреса обоих фронтендов
    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:5173"]

    # Адреса фронтендов для ссылок в письмах
    web_url: str = "http://localhost:3000"
    app_url: str = "http://localhost:5173"

    # Токены
    access_token_ttl_minutes: int = 15
    refresh_token_ttl_days: int = 30
    email_verification_ttl_hours: int = 24
    password_reset_ttl_minutes: int = 30

    # Cookie для refresh-токена
    refresh_cookie_name: str = "remora_refresh"
    cookie_secure: bool = False
    cookie_samesite: Literal["lax", "none", "strict"] = "lax"
    cookie_domain: str | None = None

    # SMTP
    smtp_host: str = "localhost"
    smtp_port: int = 1025
    smtp_from: str = "noreply@remora.local"
    smtp_username: str | None = None
    smtp_password: SecretStr | None = None
    smtp_start_tls: bool = False

    # Синтез речи. Без ключа провайдер выключен: интерфейс продолжает работать,
    # просто не предлагает озвучку — обучение от TTS зависеть не должно.
    tts_provider: Literal["yandex", "disabled"] = "disabled"
    yandex_speechkit_api_key: SecretStr | None = None
    yandex_speechkit_folder_id: str | None = None
    tts_max_chars_per_request: int = 500
    tts_request_timeout_seconds: float = 15.0

    @property
    def is_local(self) -> bool:
        return self.environment == "local"


@lru_cache
def get_settings() -> Settings:
    return Settings()
