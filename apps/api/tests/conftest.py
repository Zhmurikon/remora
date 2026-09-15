import os

import pytest

# Настройки должны существовать до импорта приложения.
os.environ.setdefault("SECRET_KEY", "test-secret-key-at-least-32-characters-long")
os.environ.setdefault(
    "DATABASE_URL", "postgresql+asyncpg://remora:remora@localhost:5432/remora_test"
)
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/1")
os.environ.setdefault("ENVIRONMENT", "local")

from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from app.db.session import dispose_engine, get_engine
from app.main import create_app


@pytest.fixture
async def client() -> AsyncClient:
    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    # Очистка таблиц в том же event loop, до закрытия
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.execute(
            text(
                "TRUNCATE users, user_settings, refresh_tokens, "
                "oauth_accounts, consents CASCADE"
            )
        )
    await dispose_engine()
