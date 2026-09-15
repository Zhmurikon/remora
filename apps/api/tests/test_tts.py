"""Озвучка: глобальный кэш, расход квоты и права доступа.

Провайдер подменён: тесты не ходят в SpeechKit и не тратят реальную квоту.
"""

from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest

from app.services.tts import DisabledProvider, TtsService, cache_key


class FakeProvider:
    """Считает вызовы: по ним видно, что кэш действительно экономит синтез."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, str, str, float]] = []

    async def synthesize(self, text: str, *, lang: str, voice: str, speed: float) -> bytes:
        self.calls.append((text, lang, voice, speed))
        return b"fake-mp3-payload"


async def _auth(client: pytest.fixture, suffix: str) -> dict[str, str]:
    email = f"tts-{suffix}@example.com"
    await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "Str0ngP@ss!", "username": f"tts{suffix}"},
    )
    login = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": "Str0ngP@ss!"}
    )
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


async def _set_with_card(client: pytest.fixture, headers: dict[str, str]) -> dict[str, str]:
    created = await client.post(
        "/api/v1/sets",
        headers=headers,
        json={"title": "Слова", "lang_term": "ru", "lang_definition": "en"},
    )
    set_id = created.json()["id"]
    saved = await client.put(
        f"/api/v1/sets/{set_id}/cards",
        headers=headers,
        json={"cards": [{"term": "кошка", "definition": "cat"}]},
    )
    return {"set_id": set_id, "card_id": saved.json()["cards"][0]["id"]}


def test_cache_key_depends_on_every_parameter() -> None:
    base = cache_key("кошка", lang="ru", voice="alena", speed=1.0)
    assert base == cache_key("кошка", lang="ru", voice="alena", speed=1.0)
    assert base != cache_key("кошки", lang="ru", voice="alena", speed=1.0)
    assert base != cache_key("кошка", lang="en", voice="alena", speed=1.0)
    assert base != cache_key("кошка", lang="ru", voice="filipp", speed=1.0)
    assert base != cache_key("кошка", lang="ru", voice="alena", speed=1.5)


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_status_reports_disabled_provider(
    _mock_send: AsyncMock, client: pytest.fixture
) -> None:
    """Без ключа SpeechKit интерфейс должен узнать об этом заранее, а не по 503."""
    headers = await _auth(client, "status")
    response = await client.get("/api/v1/tts/status", headers=headers)
    assert response.status_code == 200
    assert response.json()["available"] is False
    assert response.json()["chars_used_this_month"] == 0
    assert response.json()["voices"]["ru"]


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_speak_is_unavailable_without_provider(
    _mock_send: AsyncMock, client: pytest.fixture
) -> None:
    headers = await _auth(client, "off")
    card = await _set_with_card(client, headers)

    response = await client.post(
        "/api/v1/tts/speak", headers=headers, json={"card_id": card["card_id"]}
    )
    assert response.status_code == 503
    assert response.json()["code"] == "TTS_UNAVAILABLE"


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_second_request_hits_the_cache_and_spends_no_quota(
    _mock_send: AsyncMock, client: pytest.fixture
) -> None:
    provider = FakeProvider()
    headers = await _auth(client, "cache")
    card = await _set_with_card(client, headers)

    with patch("app.services.tts.build_provider", return_value=provider):
        first = await client.post(
            "/api/v1/tts/speak", headers=headers, json={"card_id": card["card_id"]}
        )
        second = await client.post(
            "/api/v1/tts/speak", headers=headers, json={"card_id": card["card_id"]}
        )

        assert first.status_code == 200, first.text
        assert first.json()["cached"] is False
        assert second.json()["cached"] is True
        # Синтез вызван ровно один раз на два запроса.
        assert len(provider.calls) == 1
        assert first.json()["audio_url"].startswith("http")

        usage = await client.get("/api/v1/tts/status", headers=headers)
        # «кошка» — пять символов, и списаны они только за первый вызов.
        assert usage.json()["chars_used_this_month"] == 5


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_cache_is_shared_between_users(
    _mock_send: AsyncMock, client: pytest.fixture
) -> None:
    """Главная экономика режима: чужой синтез достаётся бесплатно."""
    provider = FakeProvider()
    first_user = await _auth(client, "first")
    second_user = await _auth(client, "second")
    first_card = await _set_with_card(client, first_user)
    second_card = await _set_with_card(client, second_user)

    with patch("app.services.tts.build_provider", return_value=provider):
        await client.post(
            "/api/v1/tts/speak", headers=first_user, json={"card_id": first_card["card_id"]}
        )
        response = await client.post(
            "/api/v1/tts/speak", headers=second_user, json={"card_id": second_card["card_id"]}
        )

    assert response.json()["cached"] is True
    assert len(provider.calls) == 1
    usage = await client.get("/api/v1/tts/status", headers=second_user)
    assert usage.json()["chars_used_this_month"] == 0


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_different_sides_use_the_language_of_that_side(
    _mock_send: AsyncMock, client: pytest.fixture
) -> None:
    provider = FakeProvider()
    headers = await _auth(client, "langs")
    card = await _set_with_card(client, headers)

    with patch("app.services.tts.build_provider", return_value=provider):
        term = await client.post(
            "/api/v1/tts/speak",
            headers=headers,
            json={"card_id": card["card_id"], "side": "question"},
        )
        definition = await client.post(
            "/api/v1/tts/speak",
            headers=headers,
            json={"card_id": card["card_id"], "side": "answer"},
        )

    assert term.json()["lang"] == "ru"
    assert term.json()["voice"] == "alena"
    assert definition.json()["lang"] == "en"
    assert definition.json()["voice"] == "john"
    assert [call[0] for call in provider.calls] == ["кошка", "cat"]


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_foreign_cards_cannot_be_voiced(
    _mock_send: AsyncMock, client: pytest.fixture
) -> None:
    """Иначе через озвучку читался бы чужой приватный контент."""
    owner = await _auth(client, "owner")
    stranger = await _auth(client, "stranger")
    card = await _set_with_card(client, owner)

    with patch("app.services.tts.build_provider", return_value=FakeProvider()):
        response = await client.post(
            "/api/v1/tts/speak", headers=stranger, json={"card_id": card["card_id"]}
        )
    assert response.status_code == 404

    missing = await client.post(
        "/api/v1/tts/speak", headers=owner, json={"card_id": str(uuid4())}
    )
    assert missing.status_code == 404


async def test_tts_endpoints_require_authentication(client: pytest.fixture) -> None:
    assert (await client.get("/api/v1/tts/status")).status_code == 401
    assert (
        await client.post("/api/v1/tts/speak", json={"card_id": str(uuid4())})
    ).status_code == 401


async def test_disabled_provider_is_the_default(client: pytest.fixture) -> None:
    # Ключ SpeechKit — внешняя задача; на локальном окружении синтез выключен.
    from app.db.session import get_session_factory

    async with get_session_factory()() as session:
        assert isinstance(TtsService(session).provider, DisabledProvider)
