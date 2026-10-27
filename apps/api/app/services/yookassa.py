"""Минимальный серверный клиент ЮKassa для redirect-платежей."""

from typing import Any

import httpx

from app.core.config import get_settings
from app.core.errors import AppError


class YooKassaUnavailableError(AppError):
    code = "PAYMENTS_UNAVAILABLE"
    status_code = 503
    message = "Оплата временно недоступна"


class YooKassaClient:
    def _credentials(self) -> tuple[str, str]:
        settings = get_settings()
        if not settings.yookassa_shop_id or settings.yookassa_secret_key is None:
            raise YooKassaUnavailableError()
        return settings.yookassa_shop_id, settings.yookassa_secret_key.get_secret_value()

    async def create_payment(self, payload: dict[str, Any], idempotency_key: str) -> dict[str, Any]:
        settings = get_settings()
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(
                f"{settings.yookassa_api_url.rstrip('/')}/payments",
                auth=self._credentials(),
                headers={"Idempotence-Key": idempotency_key},
                json=payload,
            )
        if response.status_code >= 400:
            raise YooKassaUnavailableError("ЮKassa не приняла запрос на оплату")
        return dict(response.json())

    async def get_payment(self, payment_id: str) -> dict[str, Any]:
        settings = get_settings()
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.get(
                f"{settings.yookassa_api_url.rstrip('/')}/payments/{payment_id}",
                auth=self._credentials(),
            )
        if response.status_code >= 400:
            raise YooKassaUnavailableError("Не удалось проверить платёж")
        return dict(response.json())

    async def get_refund(self, refund_id: str) -> dict[str, Any]:
        settings = get_settings()
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.get(
                f"{settings.yookassa_api_url.rstrip('/')}/refunds/{refund_id}",
                auth=self._credentials(),
            )
        if response.status_code >= 400:
            raise YooKassaUnavailableError("Не удалось проверить возврат")
        return dict(response.json())

    async def create_refund(self, payload: dict[str, Any], idempotency_key: str) -> dict[str, Any]:
        settings = get_settings()
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(
                f"{settings.yookassa_api_url.rstrip('/')}/refunds",
                auth=self._credentials(),
                headers={"Idempotence-Key": idempotency_key},
                json=payload,
            )
        if response.status_code >= 400:
            raise YooKassaUnavailableError("ЮKassa не приняла запрос на возврат")
        return dict(response.json())
