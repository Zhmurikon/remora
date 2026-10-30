import asyncio
import json
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import httpx
import pytest
from httpx import AsyncClient
from pydantic import SecretStr
from sqlalchemy import select

from app.core.config import get_settings
from app.db.session import get_session_factory
from app.generation_worker import process_generation, recover_generations
from app.models.billing import Entitlement, EntitlementSource
from app.models.generations import GenerationJob
from app.models.transcriptions import TranscriptionJob, TranscriptionStatus
from app.models.user import User
from app.schemas.generations import GeneratedCard, card_issues
from app.services import generation_provider as provider
from tests.test_transcriptions import register

CARDS = [
    {
        "term": "Дисперсия",
        "definition": "Мера разброса значений",
        "wrong_definition_answers": [
            "Среднее значение величины",
            "Самое частое наблюдение",
            "Связь двух разных признаков",
        ],
    }
]


async def setup(client: AsyncClient, monkeypatch: pytest.MonkeyPatch, *, paid: bool = True):
    headers, email = await register(client, "generate")
    monkeypatch.setattr(get_settings(), "open_ai_api_key", SecretStr("test-only-key"))
    monkeypatch.setattr("app.api.v1.generations.enqueue_generation", AsyncMock())
    async with get_session_factory()() as db:
        user = await db.scalar(select(User).where(User.email == email))
        assert user
        if paid:
            for key, value in [
                ("feature.ai.generation", True),
                ("limit.ai.generation_tokens_per_week", 500_000),
            ]:
                db.add(
                    Entitlement(
                        user_id=user.id,
                        key=key,
                        value=value,
                        source=EntitlementSource.admin,
                        reason="Тест",
                        starts_at=datetime.now(UTC) - timedelta(minutes=1),
                    )
                )
        source = TranscriptionJob(
            user_id=user.id,
            filename="Лекция.txt",
            content_type="text/plain",
            size_bytes=30,
            total_parts=1,
            status=TranscriptionStatus.completed,
            result_text="Дисперсия — мера разброса значений.",
        )
        db.add(source)
        await db.commit()
        return headers, str(source.id)


def mock_provider(
    monkeypatch: pytest.MonkeyPatch, *, cards: bool = False, incomplete: bool = False
):
    monkeypatch.setattr(provider, "prepare", AsyncMock(side_effect=lambda body: body))
    call = AsyncMock(
        return_value={
            "status": "incomplete" if incomplete else "completed",
            "usage": {"input_tokens": 120, "output_tokens": 80},
            "output": [
                {
                    "type": "message",
                    "content": [
                        {
                            "type": "output_text",
                            "text": json.dumps({"cards": CARDS}, ensure_ascii=False)
                            if cards
                            else "# Конспект\n\nМера разброса.",
                        }
                    ],
                }
            ],
        }
    )
    monkeypatch.setattr(provider, "generate", call)
    return call


async def start(
    client: AsyncClient, headers, source_id, kind="notes", parent_id=None, request_id=None
):
    response = await client.post(
        f"/api/v1/transcriptions/{source_id}/generations",
        headers=headers,
        json={"request_id": str(request_id or uuid4()), "kind": kind, "parent_id": parent_id},
    )
    assert response.status_code == 202, response.text
    return response.json()


async def usage(client, headers):
    response = await client.get("/api/v1/billing/entitlements", headers=headers)
    return response.json()["usage"]["ai.generation_tokens_per_week"]


async def test_generation_snapshot_idempotency_quota_and_access(client, monkeypatch):
    headers, source = await setup(client, monkeypatch)
    outsider, _ = await register(client, "other")
    request_id = uuid4()
    job = await start(client, headers, source, request_id=request_id)
    reserved = await usage(client, headers)
    assert reserved > 200
    assert (await start(client, headers, source, request_id=request_id))["id"] == job["id"]
    assert (
        await client.post(
            f"/api/v1/transcriptions/{source}/generations",
            headers=headers,
            json={"request_id": str(uuid4()), "kind": "notes"},
        )
    ).status_code == 409
    assert await usage(client, headers) == reserved
    for path in [
        f"/api/v1/transcriptions/{source}/generations",
        f"/api/v1/generations/{job['id']}",
    ]:
        assert (await client.get(path, headers=outsider)).status_code == 404
    assert (
        await client.post(
            f"/api/v1/transcriptions/{source}/generations",
            headers=outsider,
            json={"request_id": str(uuid4()), "kind": "notes"},
        )
    ).status_code == 404
    assert (
        await client.patch(
            f"/api/v1/generations/{job['id']}",
            headers=outsider,
            json={"revision": job["updated_at"], "markdown": "чужое"},
        )
    ).status_code == 404
    assert (
        await client.post(
            f"/api/v1/generations/{job['id']}/save-set",
            headers=outsider,
            json={"revision": job["updated_at"], "title": "чужое"},
        )
    ).status_code == 404
    assert (
        await client.delete(f"/api/v1/transcriptions/{source}", headers=headers)
    ).status_code == 409
    await client.patch(
        f"/api/v1/transcriptions/{source}", headers=headers, json={"result_text": "Новая редакция"}
    )
    call = mock_provider(monkeypatch)
    await asyncio.gather(process_generation({}, job["id"]), process_generation({}, job["id"]))
    call.assert_awaited_once()
    assert "Дисперсия" in call.call_args.args[0]["input"][1]["content"]
    assert await usage(client, headers) == 200
    assert (await start(client, headers, source, request_id=request_id))["status"] == "completed"
    ready = (await client.get(f"/api/v1/generations/{job['id']}", headers=headers)).json()
    assert ready["markdown"].startswith("#")
    updated = await client.patch(
        f"/api/v1/generations/{job['id']}",
        headers=headers,
        json={"revision": ready["updated_at"], "markdown": "# Правка"},
    )
    assert updated.status_code == 200
    assert (
        await client.patch(
            f"/api/v1/generations/{job['id']}",
            headers=headers,
            json={"revision": ready["updated_at"], "markdown": "Старое"},
        )
    ).status_code == 409
    async with get_session_factory()() as db:
        stored = await db.get(GenerationJob, UUID(job["id"]))
        assert stored.provider_response and stored.estimated_cost_usd == "0.0015"


async def test_cards_edit_validate_save_private_set_once(client, monkeypatch):
    headers, source = await setup(client, monkeypatch)
    note = await start(client, headers, source)
    mock_provider(monkeypatch)
    await process_generation({}, note["id"])
    cards = await start(client, headers, source, "cards", note["id"])
    mock_provider(monkeypatch, cards=True)
    await process_generation({}, cards["id"])
    ready = (await client.get(f"/api/v1/generations/{cards['id']}", headers=headers)).json()
    assert ready["issues"] == []
    bad = [
        {
            **CARDS[0],
            "definition": "Очень длинное правильное определение с избыточным описанием понятия",
        }
    ]
    updated = await client.patch(
        f"/api/v1/generations/{cards['id']}",
        headers=headers,
        json={"revision": ready["updated_at"], "cards": bad},
    )
    assert updated.status_code == 200
    assert updated.json()["issues"]
    body = {"revision": updated.json()["updated_at"], "title": "Понятия"}
    assert (
        await client.post(f"/api/v1/generations/{cards['id']}/save-set", headers=headers, json=body)
    ).status_code == 422
    fixed = await client.patch(
        f"/api/v1/generations/{cards['id']}",
        headers=headers,
        json={"revision": updated.json()["updated_at"], "cards": CARDS},
    )
    body["revision"] = fixed.json()["updated_at"]
    saved = await client.post(
        f"/api/v1/generations/{cards['id']}/save-set", headers=headers, json=body
    )
    assert saved.status_code == 200, saved.text
    again = await client.post(
        f"/api/v1/generations/{cards['id']}/save-set", headers=headers, json=body
    )
    assert again.json()["saved_set_id"] == saved.json()["saved_set_id"]
    result = await client.get(f"/api/v1/sets/{saved.json()['saved_set_id']}", headers=headers)
    assert result.json()["visibility"] == "private"
    assert len(result.json()["cards"][0]["wrong_definition_answers"]) == 3


async def test_generation_failure_and_stale_recovery_refund_once(client, monkeypatch):
    headers, source = await setup(client, monkeypatch)
    job = await start(client, headers, source)
    call = mock_provider(monkeypatch, incomplete=True)
    await process_generation({}, job["id"])
    await process_generation({}, job["id"])
    call.assert_awaited_once()
    assert await usage(client, headers) == 0
    stored = (await client.get(f"/api/v1/generations/{job['id']}", headers=headers)).json()
    assert stored["status"] == "failed" and stored["markdown"] is None
    stale = await start(client, headers, source)
    async with get_session_factory()() as db:
        row = await db.get(GenerationJob, UUID(stale["id"]))
        row.status = "processing"
        row.started_at = datetime.now(UTC) - timedelta(minutes=11)
        await db.commit()
    redis = AsyncMock()
    await recover_generations({"redis": redis})
    await recover_generations({"redis": redis})
    assert await usage(client, headers) == 0
    redis.enqueue_job.assert_not_awaited()


async def test_free_cannot_generate_and_read_does_not_require_subscription(client, monkeypatch):
    headers, source = await setup(client, monkeypatch, paid=False)
    response = await client.post(
        f"/api/v1/transcriptions/{source}/generations",
        headers=headers,
        json={"request_id": str(uuid4()), "kind": "notes"},
    )
    assert response.status_code == 402
    assert await usage(client, headers) == 0
    assert (
        await client.get(f"/api/v1/transcriptions/{source}/generations", headers=headers)
    ).status_code == 200


async def test_generation_quota_exhausted_and_account_export(client, monkeypatch):
    from io import BytesIO
    from zipfile import ZipFile

    from app.services.account_exports import AccountExportService

    headers, source = await setup(client, monkeypatch)
    job = await start(client, headers, source)
    mock_provider(monkeypatch)
    await process_generation({}, job["id"])
    async with get_session_factory()() as db:
        user = await db.scalar(
            select(User).where(User.email == "transcription-generate@example.com")
        )
        archive = await AccountExportService(db).build_archive(user)
        with ZipFile(BytesIO(archive)) as zipped:
            data = json.loads(zipped.read("ai-materials.json"))
            assert len(data["generations"]) == 1
            assert data["generations"][0]["source_text"].startswith("Дисперсия")
        entitlement = await db.scalar(
            select(Entitlement).where(
                Entitlement.user_id == user.id,
                Entitlement.key == "limit.ai.generation_tokens_per_week",
            )
        )
        entitlement.value = 200
        await db.commit()
    response = await client.post(
        f"/api/v1/transcriptions/{source}/generations",
        headers=headers,
        json={"request_id": str(uuid4()), "kind": "notes"},
    )
    assert response.status_code == 402
    assert response.json()["details"]["limit_key"] == "ai.generation_tokens_per_week"
    assert await usage(client, headers) == 200


def test_card_rules_and_budget_math():
    assert card_issues([GeneratedCard.model_validate(CARDS[0])]) == []
    assert card_issues(
        [
            GeneratedCard(
                term="Очень длинный термин из шести разных слов",
                definition="Ответ",
                wrong_definition_answers=["ответ", " ответ ", "Ответ"],
            )
        ]
    )
    assert (
        provider.cost_usd(provider.NOTES_MODEL, {"input_tokens": 2265, "output_tokens": 1977})
        == "0.0353175"
    )


async def test_provider_budget_rejects_long_source_without_generation(monkeypatch):
    transport = httpx.MockTransport(
        lambda request: httpx.Response(200, json={"input_tokens": 20_000})
    )
    monkeypatch.setattr(
        provider,
        "client",
        lambda: httpx.AsyncClient(base_url="https://api.openai.com/v1", transport=transport),
    )
    from app.core.errors import ValidationError

    with pytest.raises(ValidationError, match="слишком длинный"):
        await provider.prepare(provider.build_request("notes", "Тема", "Текст"))
