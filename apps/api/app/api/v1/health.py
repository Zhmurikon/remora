"""Проверки живости. Используются docker healthcheck, CI и мониторингом."""

from typing import Annotated, Literal

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.db.session import get_db

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    status: Literal["ok"]
    environment: str
    version: str


class ReadinessResponse(BaseModel):
    status: Literal["ok", "degraded"]
    checks: dict[str, str]


@router.get("/health", response_model=HealthResponse, summary="Живость приложения")
async def health(settings: Annotated[Settings, Depends(get_settings)]) -> HealthResponse:
    return HealthResponse(status="ok", environment=settings.environment, version="0.0.0")


@router.get("/ready", response_model=ReadinessResponse, summary="Готовность зависимостей")
async def ready(
    db: Annotated[AsyncSession, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> ReadinessResponse:
    checks: dict[str, str] = {}

    try:
        await db.execute(text("SELECT 1"))
        checks["postgres"] = "ok"
    except Exception as exc:  # noqa: BLE001 — статус важнее типа ошибки
        checks["postgres"] = f"error: {type(exc).__name__}"

    try:
        client: aioredis.Redis = aioredis.from_url(  # type: ignore[no-untyped-call]
            str(settings.redis_url)
        )
        await client.ping()
        await client.aclose()
        checks["redis"] = "ok"
    except Exception as exc:  # noqa: BLE001
        checks["redis"] = f"error: {type(exc).__name__}"

    healthy = all(value == "ok" for value in checks.values())
    return ReadinessResponse(status="ok" if healthy else "degraded", checks=checks)
