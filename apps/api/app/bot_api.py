"""Отдельное ASGI-приложение: внутренние маршруты не входят в публичный router."""

import secrets
from uuid import UUID

from fastapi import Depends, FastAPI, Header
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import UnauthorizedError, register_exception_handlers
from app.core.logging import RequestIdMiddleware, configure_logging
from app.db.session import get_db
from app.schemas.bots import BotDelivery, BotDeliveryAck, BotEventIn, BotPlatform
from app.services.bots import BotService

settings = get_settings()
configure_logging(
    json_output=not settings.is_local,
    level=settings.log_level,
    log_file=settings.log_file,
    max_bytes=settings.log_max_bytes,
    backup_count=settings.log_backup_count,
)
app = FastAPI(title="Remora internal bot API", docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(RequestIdMiddleware)
register_exception_handlers(app)


async def platform_auth(
    x_bot_platform: BotPlatform = Header(), authorization: str = Header(default="")
) -> BotPlatform:
    settings = get_settings()
    expected = (
        settings.bot_tg_service_token
        if x_bot_platform == BotPlatform.telegram
        else settings.bot_vk_service_token
    ).get_secret_value()
    if not expected or not secrets.compare_digest(authorization, "Bearer " + expected):
        raise UnauthorizedError()
    return x_bot_platform


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/internal/v1/events", status_code=204)
async def enqueue(
    body: BotEventIn,
    platform: BotPlatform = Depends(platform_auth),
    db: AsyncSession = Depends(get_db),
) -> None:
    await BotService(db).enqueue(platform, body)


@app.post("/internal/v1/delivery", response_model=BotDelivery | None)
async def claim(
    platform: BotPlatform = Depends(platform_auth), db: AsyncSession = Depends(get_db)
) -> BotDelivery | None:
    return await BotService(db).claim(platform)


@app.post("/internal/v1/delivery/{event_id}/ack", status_code=204)
async def ack(
    event_id: UUID,
    body: BotDeliveryAck,
    platform: BotPlatform = Depends(platform_auth),
    db: AsyncSession = Depends(get_db),
) -> None:
    await BotService(db).ack(platform, event_id, body)
