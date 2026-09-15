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
    api_v1_prefix: str = "/api/v1"
    project_name: str = "Remora API"

    # Секреты
    secret_key: str = Field(min_length=32)

    # Инфраструктура
    database_url: PostgresDsn
    redis_url: RedisDsn

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

    @property
    def is_local(self) -> bool:
        return self.environment == "local"


@lru_cache
def get_settings() -> Settings:
    return Settings()
