import asyncio
import hashlib
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient, Request, Response
from pydantic import SecretStr
from sqlalchemy import delete, select

from app.bot_api import app as internal_app
from app.bots.adapter import Adapter, AdapterSettings, create_app, normalize
from app.core.config import get_settings
from app.db.session import get_session_factory
from app.models.bots import BotEvent, BotLinkCode
from tests.test_study import _auth, _set_with_cards


async def test_polling_offset_after_durable_enqueue(monkeypatch):
    adapter = Adapter(AdapterSettings(bot_platform="telegram", bot_service_token=SecretStr("test")))
    update = {
        "update_id": 42,
        "message": {
            "from": {"id": 123},
            "chat": {"id": 123, "type": "private"},
            "text": "/start",
        },
    }
    telegram = AsyncMock()
    telegram.post.return_value = Response(
        200, json={"ok": True, "result": [update]}, request=Request("POST", "https://example.test")
    )
    internal = AsyncMock()
    enqueue = AsyncMock(side_effect=RuntimeError("DB unavailable"))
    monkeypatch.setattr(adapter, "internal", enqueue)
    with pytest.raises(RuntimeError):
        await adapter.poll_once(telegram, internal, 0)
    enqueue.side_effect = None
    assert await adapter.poll_once(telegram, internal, 0) == 43
    assert telegram.post.call_args.kwargs["json"]["offset"] == 0
    assert enqueue.call_args.args[2]["event_id"] == "42"
    assert enqueue.call_args.args[2]["command"] == "start"


@pytest.mark.parametrize("platform", ["telegram", "vk"])
async def test_proxy_only_for_telegram_delivery(monkeypatch, platform):
    clients = []
    factory = AsyncClient

    def make_client(**kwargs):
        client = factory(**kwargs)
        clients.append((client, kwargs.get("proxy")))
        return client

    adapter = Adapter(
        AdapterSettings(
            bot_platform=platform,
            bot_service_token=SecretStr("test"),
            tg_proxy_url=SecretStr("socks5h://localhost:9999"),
        )
    )
    response = type("Reply", (), {"json": lambda self: {"id": "1", "lease_token": "2"}})()
    internal = AsyncMock(return_value=response)
    send = AsyncMock(return_value=True)
    monkeypatch.setattr("app.bots.adapter.httpx.AsyncClient", make_client)
    monkeypatch.setattr(adapter, "internal", internal)
    monkeypatch.setattr(adapter, "send", send)
    monkeypatch.setattr(
        "app.bots.adapter.asyncio.sleep", AsyncMock(side_effect=asyncio.CancelledError)
    )
    with pytest.raises(asyncio.CancelledError):
        await adapter.worker()
    assert clients[0][1] is None
    assert clients[1][1] == ("socks5h://localhost:9999" if platform == "telegram" else None)
    assert internal.call_args_list[0].args[0] is clients[0][0]
    assert internal.call_args_list[1].args[0] is clients[0][0]
    assert send.call_args.args[0] is clients[1][0]


async def test_telegram_callback_edits_existing_message():
    adapter = Adapter(
        AdapterSettings(
            bot_platform="telegram",
            bot_service_token=SecretStr("test"),
            tg_bot_token=SecretStr("token"),
        )
    )
    client = AsyncMock()
    client.post.return_value = Response(
        200,
        json={"ok": True},
        request=Request("POST", "https://api.telegram.org"),
    )
    success = await adapter.send(
        client,
        {
            "actor_id": "123",
            "callback_id": "callback",
            "message_id": "77",
            "text": "Следующий экран",
            "keyboard": [[{"label": "Назад", "action": "home"}]],
        },
    )
    assert success is True
    assert client.post.call_args_list[1].args[0].endswith("/editMessageText")
    assert client.post.call_args_list[1].kwargs["json"]["message_id"] == "77"


@pytest.fixture
async def internal(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "bot_tg_service_token", SecretStr("test-tg-service"))
    monkeypatch.setattr(get_settings(), "bot_vk_service_token", SecretStr("test-vk-service"))
    async with AsyncClient(
        transport=ASGITransport(app=internal_app),
        base_url="http://internal",
        headers={"X-Bot-Platform": "telegram", "Authorization": "Bearer test-tg-service"},
    ) as ac:
        yield ac
    async with get_session_factory()() as db:
        await db.execute(delete(BotEvent))
        await db.commit()


async def event(internal, actor="123", code=None, command="status", **kw):
    body = {
        "event_id": str(uuid4()),
        "actor_id": actor,
        "command": "link" if code else command,
        **kw,
    }
    if code:
        body["code_hash"] = hashlib.sha256(code.encode()).hexdigest()
    response = await internal.post("/internal/v1/events", json=body)
    assert response.status_code == 204
    return body


async def ack(internal, job):
    response = await internal.post(
        f"/internal/v1/delivery/{job['id']}/ack",
        json={"lease_token": job["lease_token"], "success": True},
    )
    assert response.status_code == 204


async def test_link_ownership_revoke_and_dedup(client, internal):
    owner = await _auth(client, "botowner")
    stranger = await _auth(client, "botstranger")
    code = (
        await client.post(
            "/api/v1/users/me/bots/code", headers=owner, json={"platform": "telegram"}
        )
    ).json()["code"]
    body = await event(internal, code=code)
    assert (await internal.post("/internal/v1/events", json=body)).status_code == 204
    jobs = await asyncio.gather(
        internal.post("/internal/v1/delivery"), internal.post("/internal/v1/delivery")
    )
    assert sum(j.json() is not None for j in jobs) == 1
    job = next(j.json() for j in jobs if j.json())
    assert "привязан" in job["text"]
    await ack(internal, job)
    await ack(internal, job)
    assert (await internal.post("/internal/v1/delivery")).json() is None
    links = (await client.get("/api/v1/users/me/bots", headers=owner)).json()
    assert len(links) == 1
    assert (await client.get("/api/v1/users/me/bots", headers=stranger)).json() == []
    assert (
        await client.delete(f"/api/v1/users/me/bots/{links[0]['id']}", headers=stranger)
    ).status_code == 404
    await event(internal, actor="456", code=code)
    failed = (await internal.post("/internal/v1/delivery")).json()
    assert "недействителен" in failed["text"]
    await ack(internal, failed)
    assert (
        await client.delete(f"/api/v1/users/me/bots/{links[0]['id']}", headers=owner)
    ).status_code == 204
    await event(internal)
    assert "Сначала свяжите" in (await internal.post("/internal/v1/delivery")).json()["text"]
    async with get_session_factory()() as db:
        assert (await db.scalars(select(BotLinkCode))).all() == []


async def test_private_api_platform_isolation(client, internal):
    assert (await client.post("/internal/v1/events", json={})).status_code == 404
    assert (
        await internal.post("/internal/v1/delivery", headers={"Authorization": "Bearer invalid"})
    ).status_code == 401
    assert (
        await internal.post("/internal/v1/delivery", headers={"X-Bot-Platform": "vk"})
    ).status_code == 401
    await event(internal)
    job = (await internal.post("/internal/v1/delivery")).json()
    assert (
        await internal.post(
            f"/internal/v1/delivery/{job['id']}/ack",
            headers={"X-Bot-Platform": "vk", "Authorization": "Bearer test-vk-service"},
            json={"lease_token": job["lease_token"], "success": True},
        )
    ).status_code == 404


async def test_expired_and_rotated_codes(client, internal):
    owner = await _auth(client, "botexpiry")
    first = (
        await client.post(
            "/api/v1/users/me/bots/code", headers=owner, json={"platform": "telegram"}
        )
    ).json()["code"]
    second = (
        await client.post(
            "/api/v1/users/me/bots/code", headers=owner, json={"platform": "telegram"}
        )
    ).json()["code"]
    async with get_session_factory()() as db:
        code = await db.scalar(select(BotLinkCode))
        assert code.code_hash != second
        code.expires_at = datetime.now(UTC) - timedelta(seconds=1)
        await db.commit()
    await event(internal, code=first)
    job = (await internal.post("/internal/v1/delivery")).json()
    assert "недействителен" in job["text"]
    await ack(internal, job)
    await event(internal, code=second)
    assert "истёк" in (await internal.post("/internal/v1/delivery")).json()["text"]
    assert (await client.get("/api/v1/users/me/bots", headers=owner)).json() == []


async def test_lease_retry_and_other_dialog_progress(client, internal):
    await event(internal)
    first = (await internal.post("/internal/v1/delivery")).json()
    await event(internal, actor="456")
    other = (await internal.post("/internal/v1/delivery")).json()
    assert other["actor_id"] == "456"
    await ack(internal, other)
    async with get_session_factory()() as db:
        row = await db.get(BotEvent, UUID(first["id"]))
        row.available_at = datetime.now(UTC) - timedelta(seconds=1)
        await db.commit()
    again = (await internal.post("/internal/v1/delivery")).json()
    assert again["id"] == first["id"] and again["lease_token"] != first["lease_token"]
    assert (
        await internal.post(
            f"/internal/v1/delivery/{first['id']}/ack",
            json={"lease_token": first["lease_token"], "success": True},
        )
    ).status_code == 409
    await ack(internal, again)


async def test_vk_confirmation_and_webhook_auth(monkeypatch):
    cfg = AdapterSettings(
        bot_platform="vk",
        bot_service_token="internal",
        vk_group_id=123,
        vk_callback_url_token="secret",
        vk_confirmation_code="confirmation",
    )
    send = AsyncMock()
    monkeypatch.setattr(Adapter, "internal", send)
    async with AsyncClient(
        transport=ASGITransport(app=create_app(cfg, run_worker=False)), base_url="http://bot"
    ) as ac:
        body = {"type": "confirmation", "group_id": 123, "secret": "secret"}
        response = await ac.post("/callback/vk_v1/", json=body)
        assert response.text == "confirmation" and response.status_code == 200
        assert (
            await ac.post("/callback/vk_v1/", json={**body, "secret": "bad"})
        ).status_code == 403
        assert (
            await ac.post("/callback/vk_v1/", json={**body, "group_id": 999})
        ).status_code == 403
        message = {
            **body,
            "type": "message_new",
            "event_id": "event",
            "object": {"message": {"from_id": 10, "peer_id": 10, "text": "/start"}},
        }
        assert (await ac.post("/callback/vk_v1/", json=message)).text == "ok"
        assert send.await_count == 1
        message["object"]["message"]["peer_id"] = 2000000001
        assert (await ac.post("/callback/vk_v1/", json=message)).text == "ok"
        assert send.await_count == 1


async def test_telegram_secret_private_chat_and_durable_failure(monkeypatch):
    import httpx

    cfg = AdapterSettings(
        bot_platform="telegram", bot_service_token="internal", tg_webhook_secret="secret"
    )
    send = AsyncMock(side_effect=httpx.ConnectError("offline"))
    monkeypatch.setattr(Adapter, "internal", send)
    async with AsyncClient(
        transport=ASGITransport(app=create_app(cfg, run_worker=False)), base_url="http://bot"
    ) as ac:
        body = {
            "update_id": 1,
            "message": {
                "from": {"id": 10},
                "chat": {"id": 10, "type": "private"},
                "text": "/link one-time-secret",
            },
        }
        assert (await ac.post("/callback/tg_v1/", json=body)).status_code == 403
        response = await ac.post(
            "/callback/tg_v1/", json=body, headers={"X-Telegram-Bot-Api-Secret-Token": "secret"}
        )
        assert response.status_code == 503
        normalized = normalize("telegram", body)
        assert "one-time-secret" not in str(normalized)
        body["message"]["chat"]["type"] = "group"
        assert normalize("telegram", body) is None
        assert (await ac.post("/callback/tg_v1/", content=b"x" * 256001)).status_code == 413


async def test_learning_modes_share_study_session_and_progress(client, internal):
    owner = await _auth(client, "botlearning")
    study_set = await _set_with_cards(client, owner, count=4)
    course = (
        await client.post(
            "/api/v1/courses",
            headers=owner,
            json={"title": "Курс биологии", "set_id": study_set["id"]},
        )
    ).json()
    code = (
        await client.post(
            "/api/v1/users/me/bots/code", headers=owner, json={"platform": "telegram"}
        )
    ).json()["code"]
    await event(internal, code=code)
    linked = (await internal.post("/internal/v1/delivery")).json()
    await ack(internal, linked)

    await event(internal, command="settings")
    bot_settings = (await internal.post("/internal/v1/delivery")).json()
    assert "Настройки заучивания" in bot_settings["text"]
    assert [button["label"] for button in bot_settings["keyboard"][0]] == [
        "Быстро",
        "Обычно",
        "Тщательно",
    ]
    await ack(internal, bot_settings)

    await event(internal, command="learncfg:p:thorough", callback_id="settings-callback")
    thorough = (await internal.post("/internal/v1/delivery")).json()
    assert "Успешных ответов: 3" in thorough["text"]
    await ack(internal, thorough)
    saved = (await client.get("/api/v1/study/settings", headers=owner)).json()
    assert saved["learn_successes_required"] == 3
    assert saved["learn_match_percent"] == 95

    await event(internal, command=f"setcfg:view:1:{study_set['id']}")
    set_settings = (await internal.post("/internal/v1/delivery")).json()
    assert "Общие настройки" in set_settings["text"]
    await ack(internal, set_settings)
    await event(internal, command=f"setcfg:p:fast:{study_set['id']}")
    customized = (await internal.post("/internal/v1/delivery")).json()
    assert "Индивидуальные настройки" in customized["text"]
    assert "Успешных ответов: 1" in customized["text"]
    assert any(
        button["label"] == "Вернуть общие настройки"
        for row in customized["keyboard"]
        for button in row
    )
    await ack(internal, customized)
    override = (
        await client.get(f"/api/v1/study/sets/{study_set['id']}/learn-settings", headers=owner)
    ).json()
    assert override["customized"] is True
    assert override["question_types"] == ["choice", "recall"]

    await event(internal, command=f"setcfg:reset:1:{study_set['id']}")
    reset = (await internal.post("/internal/v1/delivery")).json()
    assert "Общие настройки" in reset["text"]
    await ack(internal, reset)

    await event(internal, command=f"mode:flashcards:{study_set['id']}")
    flashcard = (await internal.post("/internal/v1/delivery")).json()
    assert "Карточки" in flashcard["text"]
    assert "термин" in flashcard["text"]
    await ack(internal, flashcard)
    await event(internal, command="reveal")
    revealed = (await internal.post("/internal/v1/delivery")).json()
    assert "Термин:" in revealed["text"]
    assert "термин" in revealed["text"]
    assert "Определение:" in revealed["text"]
    assert "определение" in revealed["text"]
    await ack(internal, revealed)
    await event(internal, command="stop")
    await ack(internal, (await internal.post("/internal/v1/delivery")).json())

    await event(internal, command="sets")
    sets = (await internal.post("/internal/v1/delivery")).json()
    assert sets["keyboard"][0][0]["label"] == "Биология"
    await ack(internal, sets)

    await event(internal, command=f"mode:learn:{study_set['id']}")
    question = (await internal.post("/internal/v1/delivery")).json()
    assert "Заучивание" in question["text"]
    assert [button["label"] for button in question["keyboard"][0]] == ["А", "Б", "В", "Г"]
    for label, option in zip(["А", "Б", "В", "Г"], question["keyboard"][0], strict=True):
        index = int(option["action"].removeprefix("choice:"))
        assert f"{label}. " in question["text"]
        assert option["label"] == label
        assert index in range(4)
    await ack(internal, question)

    await event(internal, command="choice:0", callback_id="callback")
    answered = (await internal.post("/internal/v1/delivery")).json()
    assert "2/" in answered["text"]
    await ack(internal, answered)

    active = await client.get(
        "/api/v1/study/sessions/active",
        headers=owner,
        params={"set_id": study_set["id"], "mode": "learn"},
    )
    assert active.status_code == 200
    assert active.json()["cards_seen"] == 1

    await event(internal, command="courses")
    courses = (await internal.post("/internal/v1/delivery")).json()
    assert courses["keyboard"][0][0]["label"] == "Курс биологии"
    await ack(internal, courses)

    await event(internal, command=f"course:{course['id']}")
    course_reply = (await internal.post("/internal/v1/delivery")).json()
    article_action = course_reply["keyboard"][0][0]["action"]
    assert article_action.startswith("article:")
    await ack(internal, course_reply)

    await event(internal, command=article_action)
    article = (await internal.post("/internal/v1/delivery")).json()
    assert article["keyboard"][0][0]["label"] == "Учить карточки статьи"
    await ack(internal, article)

    await event(internal, command="stop")
    await ack(internal, (await internal.post("/internal/v1/delivery")).json())
    settings = await client.patch(
        "/api/v1/study/settings",
        headers=owner,
        json={
            "learn_question_types": ["typing"],
            "learn_successes_required": 2,
            "learn_typing_check": "self_check",
            "learn_match_percent": 80,
        },
    )
    assert settings.status_code == 200
    await event(internal, command=f"mode:learn:{study_set['id']}")
    typed_question = (await internal.post("/internal/v1/delivery")).json()
    assert "Напишите ответ следующим сообщением" in typed_question["text"]
    assert typed_question["keyboard"] == []


def test_normalize_learning_commands_and_typed_answers():
    callback = {
        "update_id": 50,
        "callback_query": {
            "id": "cb",
            "from": {"id": 123},
            "message": {"message_id": 77, "chat": {"id": 123, "type": "private"}},
            "data": "sets",
        },
    }
    assert normalize("telegram", callback)["command"] == "sets"
    assert normalize("telegram", callback)["message_id"] == "77"
    typed = {
        "update_id": 51,
        "message": {
            "from": {"id": 123},
            "chat": {"id": 123, "type": "private"},
            "text": "мой ответ",
        },
    }
    normalized = normalize("telegram", typed)
    assert normalized["command"] == "input"
    assert normalized["input"] == "мой ответ"
