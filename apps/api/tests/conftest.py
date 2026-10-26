import os
from typing import Any

import pytest

# Настройки должны существовать до импорта приложения.
os.environ.setdefault("SECRET_KEY", "test-secret-key-at-least-32-characters-long")
os.environ.setdefault(
    "DATABASE_URL", "postgresql+asyncpg://remora:remora@localhost:5432/remora_test"
)
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/1")
os.environ.setdefault("ENVIRONMENT", "local")
os.environ.setdefault("TRANSCRIBER_SERVICE_TOKEN", "test-transcriber-service-token")
os.environ.setdefault("DATA_ENCRYPTION_KEYS", '["a2tra2tra2tra2tra2tra2tra2tra2tra2tra2tra2s="]')
# Тесты не должны отправлять письма через рабочие реквизиты из .env.
os.environ["SMTP_HOST"] = "localhost"
os.environ["SMTP_PORT"] = "1025"
os.environ["SMTP_USERNAME"] = ""
os.environ["SMTP_PASSWORD"] = ""
os.environ["SMTP_START_TLS"] = "false"
os.environ["SMTP_FROM"] = "tests@remora.local"
os.environ["DEBUG"] = "false"

import redis.asyncio as redis
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from app.core.config import get_settings
from app.db.session import dispose_engine, get_engine
from app.main import create_app


class LegalTestClient(AsyncClient):
    """Старые сценарии регистрации используют действующие версии документов."""

    async def request(self, method: str, url: Any, **kwargs: Any) -> Any:
        if method.upper() == "POST" and str(url).endswith("/api/v1/auth/register"):
            payload = dict(kwargs.get("json") or {})
            payload.setdefault("birth_date", "2000-01-01")
            payload.setdefault("pdn_version", "2026-10-26")
            payload.setdefault("offer_version", "2026-10-26")
            kwargs["json"] = payload
        return await super().request(method, url, **kwargs)


@pytest.fixture
async def client() -> AsyncClient:
    app = create_app()
    transport = ASGITransport(app=app)
    async with LegalTestClient(transport=transport, base_url="http://test") as ac:
        yield ac
    # Очистка таблиц в том же event loop, до закрытия
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.execute(
            text(
                "TRUNCATE users, user_settings, refresh_tokens, action_tokens, "
                "oauth_accounts, consents, transcription_jobs CASCADE"
            )
        )
    redis_client = redis.from_url(str(get_settings().redis_url))
    await redis_client.flushdb()
    await redis_client.aclose()
    await dispose_engine()
