"""Настройки приложения. Единственное место, где читается окружение."""

from functools import lru_cache
from typing import Literal

from pydantic import Field, PostgresDsn, RedisDsn
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
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

    # Токены
    access_token_ttl_minutes: int = 15
    refresh_token_ttl_days: int = 30

    @property
    def is_local(self) -> bool:
        return self.environment == "local"


@lru_cache
def get_settings() -> Settings:
    return Settings()
