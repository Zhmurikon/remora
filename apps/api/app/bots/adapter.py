import asyncio
import hashlib
import json
import logging
import secrets
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress
from typing import Any, Literal

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, PlainTextResponse, Response
from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

log = logging.getLogger("remora.bots")


class AdapterSettings(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore")
    bot_platform: Literal["telegram", "vk"]
    bot_internal_url: str = "http://bot-api:8000"
    bot_service_token: SecretStr
    tg_bot_token: SecretStr = SecretStr("")
    tg_webhook_secret: SecretStr = SecretStr("")
    tg_proxy_url: SecretStr = SecretStr("")
    tg_update_mode: Literal["webhook", "polling"] = "webhook"
    vk_group_token: SecretStr = SecretStr("")
    vk_callback_url_token: SecretStr = SecretStr("")
    vk_confirmation_code: str = ""
    vk_group_id: int = 0
    vk_api_version: str = "5.199"


def normalize(platform: str, body: dict[str, Any]) -> dict[str, Any] | None:
    callback_id = None
    if platform == "telegram":
        callback = body.get("callback_query")
        message = (
            callback.get("message", {}) if isinstance(callback, dict) else body.get("message", {})
        )
        sender = callback.get("from", {}) if isinstance(callback, dict) else message.get("from", {})
        chat = message.get("chat", {})
        if (
            chat.get("type") != "private"
            or sender.get("is_bot")
            or sender.get("id") != chat.get("id")
        ):
            return None
        event_id = str(body["update_id"])
        actor = str(sender["id"])
        value = callback.get("data", "") if isinstance(callback, dict) else message.get("text", "")
        callback_id = str(callback["id"]) if isinstance(callback, dict) else None
    else:
        if body.get("type") not in {"message_new", "message_event"}:
            return None
        obj = body.get("object", {})
        message = obj.get("message", {}) if body["type"] == "message_new" else obj
        sender_id = message.get("from_id") if body["type"] == "message_new" else obj.get("user_id")
        peer_id = message.get("peer_id")
        if (
            not isinstance(sender_id, int)
            or sender_id <= 0
            or sender_id != peer_id
            or message.get("out")
        ):
            return None
        actor = str(sender_id)
        event_id = str(body["event_id"])
        value = message.get("text", "")
        if body["type"] == "message_event":
            callback_id = str(obj["event_id"])
            value = obj.get("payload", {}).get("command", "")
    if not isinstance(value, str):
        value = ""
    raw_value = value.strip()
    parts = raw_value.split(maxsplit=1)
    name = parts[0].split("@")[0].lower() if parts else ""
    known = {
        "/start": "start",
        "начать": "start",
        "/link": "link",
        "привязать": "link",
        "/status": "status",
        "статус": "status",
        "/unlink": "unlink",
        "/help": "help",
        "/sets": "sets",
        "наборы": "sets",
        "/courses": "courses",
        "курсы": "courses",
        "/continue": "continue",
        "продолжить": "continue",
        "/stop": "stop",
        "закончить": "stop",
    }
    command = known.get(name, name if callback_id and name else "input")
    code_hash = None
    if command in {"start", "link"} and len(parts) == 2:
        command = "link"
        code_hash = hashlib.sha256(parts[1].strip().encode()).hexdigest()
    return {
        "event_id": event_id,
        "actor_id": actor,
        "command": command,
        "input": raw_value if command == "input" else None,
        "code_hash": code_hash,
        "callback_id": callback_id,
    }


class Adapter:
    def __init__(self, settings: AdapterSettings):
        self.settings = settings
        self.headers = {
            "X-Bot-Platform": settings.bot_platform,
            "Authorization": "Bearer " + settings.bot_service_token.get_secret_value(),
        }

    async def internal(
        self, client: httpx.AsyncClient, path: str, body: dict[str, Any] | None = None
    ) -> httpx.Response:
        response = await client.post(
            self.settings.bot_internal_url + "/internal/v1/" + path, headers=self.headers, json=body
        )
        response.raise_for_status()
        return response

    async def send(self, client: httpx.AsyncClient, job: dict[str, Any]) -> bool:
        cfg = self.settings
        if cfg.bot_platform == "telegram":
            base = "https://api.telegram.org/bot" + cfg.tg_bot_token.get_secret_value() + "/"
            if job.get("callback_id"):
                await client.post(
                    base + "answerCallbackQuery", json={"callback_query_id": job["callback_id"]}
                )
            payload: dict[str, Any] = {"chat_id": job["actor_id"]}
            if job.get("keyboard"):
                payload["reply_markup"] = {
                    "inline_keyboard": [
                        [
                            {"text": button["label"], "callback_data": button["action"]}
                            for button in row
                        ]
                        for row in job["keyboard"]
                    ]
                }
            if job.get("audio_url"):
                payload.update({"audio": job["audio_url"], "caption": job["text"]})
                method = "sendAudio"
            else:
                payload["text"] = job["text"]
                method = "sendMessage"
            response = await client.post(base + method, json=payload)
            return response.is_success and bool(response.json().get("ok"))
        common = {"access_token": cfg.vk_group_token.get_secret_value(), "v": cfg.vk_api_version}
        if job.get("callback_id"):
            await client.post(
                "https://api.vk.com/method/messages.sendMessageEventAnswer",
                data={
                    **common,
                    "event_id": job["callback_id"],
                    "user_id": job["actor_id"],
                    "peer_id": job["actor_id"],
                },
            )
        # Стабильный random_id предотвращает повтор сообщения при повторной доставке VK.
        random_id = int(hashlib.sha256(job["id"].encode()).hexdigest()[:7], 16) + 1
        keyboard = None
        if job.get("keyboard"):
            keyboard = json.dumps(
                {
                    "inline": True,
                    "buttons": [
                        [
                            {
                                "action": {
                                    "type": "callback",
                                    "label": button["label"],
                                    "payload": {"command": button["action"]},
                                }
                            }
                            for button in row
                        ]
                        for row in job["keyboard"]
                    ],
                },
                ensure_ascii=False,
            )
        message = job["text"]
        if job.get("audio_url"):
            message += "\n\nАудио: " + job["audio_url"]
        response = await client.post(
            "https://api.vk.com/method/messages.send",
            data={
                **common,
                "peer_id": job["actor_id"],
                "message": message,
                "random_id": str(random_id),
                **({"keyboard": keyboard} if keyboard else {}),
            },
        )
        return response.is_success and "response" in response.json()

    async def poll_once(
        self, telegram: httpx.AsyncClient, internal: httpx.AsyncClient, offset: int
    ) -> int:
        base = "https://api.telegram.org/bot" + self.settings.tg_bot_token.get_secret_value()
        response = await telegram.post(
            base + "/getUpdates",
            json={
                "offset": offset,
                "timeout": 25,
                "allowed_updates": ["message", "callback_query"],
            },
        )
        response.raise_for_status()
        body = response.json()
        if not body.get("ok"):
            raise ValueError("Telegram polling rejected")
        for update in body["result"]:
            event = normalize("telegram", update)
            if event:
                await self.internal(internal, "events", event)
            # Подтверждаем Telegram только после надёжной записи; повторы отсекает БД.
            offset = max(offset, int(update["update_id"]) + 1)
        return offset

    async def poll(self) -> None:
        offset = 0
        async with (
            httpx.AsyncClient(timeout=10, trust_env=False) as internal,
            httpx.AsyncClient(
                timeout=40,
                trust_env=False,
                proxy=self.settings.tg_proxy_url.get_secret_value() or None,
            ) as telegram,
        ):
            while True:
                try:
                    offset = await self.poll_once(telegram, internal, offset)
                except Exception as exc:  # noqa: BLE001 — не раскрываем URL с токеном
                    log.warning("bot polling retry: %s", type(exc).__name__)
                    await asyncio.sleep(5)

    async def worker(self) -> None:
        # Внутренний API не должен проходить через внешний прокси Telegram.
        proxy = (
            self.settings.tg_proxy_url.get_secret_value() or None
            if self.settings.bot_platform == "telegram"
            else None
        )
        async with (
            httpx.AsyncClient(timeout=10, trust_env=False) as client,
            httpx.AsyncClient(timeout=20, trust_env=False, proxy=proxy) as platform_client,
        ):
            while True:
                try:
                    response = await self.internal(client, "delivery")
                    job = response.json()
                    if job:
                        success = await self.send(platform_client, job)
                        await self.internal(
                            client,
                            f"delivery/{job['id']}/ack",
                            {"lease_token": job["lease_token"], "success": success},
                        )
                except Exception as exc:  # noqa: BLE001 — событие останется в БД до повтора
                    log.warning("bot delivery retry: %s", type(exc).__name__)
                await asyncio.sleep(1)


def create_app(settings: AdapterSettings | None = None, *, run_worker: bool = True) -> FastAPI:
    cfg = settings or AdapterSettings()
    adapter = Adapter(cfg)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        task = asyncio.create_task(adapter.worker()) if run_worker else None
        poll_task = (
            asyncio.create_task(adapter.poll())
            if run_worker and cfg.bot_platform == "telegram" and cfg.tg_update_mode == "polling"
            else None
        )
        yield
        for running in (task, poll_task):
            if not running:
                continue
            running.cancel()
            with suppress(asyncio.CancelledError):
                await running

    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/callback/" + ("tg_v1/" if cfg.bot_platform == "telegram" else "vk_v1/"))
    async def webhook(request: Request) -> Response:
        # Ограничение действует и для chunked-запросов без Content-Length.
        raw = bytearray()
        async for chunk in request.stream():
            raw.extend(chunk)
            if len(raw) > 256_000:
                return JSONResponse(
                    {"code": "PAYLOAD_TOO_LARGE", "message": "Слишком большой запрос"},
                    status_code=413,
                )
        try:
            body = json.loads(raw)
            if not isinstance(body, dict):
                raise ValueError()
            if cfg.bot_platform == "telegram":
                expected = cfg.tg_webhook_secret.get_secret_value()
                actual = request.headers.get("X-Telegram-Bot-Api-Secret-Token", "")
            else:
                expected = cfg.vk_callback_url_token.get_secret_value()
                actual = body.get("secret", "")
                if body.get("group_id") != cfg.vk_group_id or cfg.vk_group_id <= 0:
                    return Response(status_code=403)
            if (
                not expected
                or not isinstance(actual, str)
                or not secrets.compare_digest(actual, expected)
            ):
                return Response(status_code=403)
            if cfg.bot_platform == "vk" and body.get("type") == "confirmation":
                if not cfg.vk_confirmation_code:
                    return Response(status_code=503)
                return PlainTextResponse(cfg.vk_confirmation_code)
            event = normalize(cfg.bot_platform, body)
        except (ValueError, TypeError, KeyError, AttributeError):
            return Response(status_code=400)
        if event:
            try:
                async with httpx.AsyncClient(timeout=10, trust_env=False) as client:
                    await adapter.internal(client, "events", event)
            except httpx.HTTPError:
                return Response(status_code=503)
        return PlainTextResponse("ok")

    return app


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(create_app(), host="0.0.0.0", port=8080, access_log=False)
