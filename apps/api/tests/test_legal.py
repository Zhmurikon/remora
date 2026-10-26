"""Версионированные согласия и возрастное ограничение публичных функций."""

from datetime import date
from unittest.mock import AsyncMock, patch

from httpx import AsyncClient
from sqlalchemy import select, update

from app.core.legal import OFFER_VERSION, PDN_CONSENT_VERSION
from app.db.session import get_session_factory
from app.models.user import Consent, ConsentKind, GuardianConsentRequest, User


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_registration_records_current_legal_versions(
    _email: AsyncMock, client: AsyncClient
) -> None:
    versions = await client.get("/api/v1/auth/legal-versions")
    assert versions.json() == {"pdn": PDN_CONSENT_VERSION, "offer": OFFER_VERSION}
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "legal@example.com",
            "password": "Str0ngP@ss!",
            "username": "legaluser",
            "birth_date": "2000-01-01",
            "pdn_version": PDN_CONSENT_VERSION,
            "offer_version": OFFER_VERSION,
        },
    )
    assert response.status_code == 201, response.text
    async with get_session_factory()() as db:
        user = await db.scalar(select(User).where(User.email == "legal@example.com"))
        assert user is not None
        consents = list((await db.scalars(select(Consent).where(Consent.user_id == user.id))).all())
        assert {(item.kind, item.version) for item in consents} == {
            (ConsentKind.pdn, PDN_CONSENT_VERSION),
            (ConsentKind.offer, OFFER_VERSION),
        }
        assert {item.ip for item in consents} == {"127.0.0.1"}


async def test_registration_rejects_stale_versions_and_missing_guardian(
    client: AsyncClient,
) -> None:
    stale = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "stale@example.com",
            "password": "Str0ngP@ss!",
            "username": "stalelegal",
            "birth_date": "2000-01-01",
            "pdn_version": "old",
            "offer_version": OFFER_VERSION,
        },
    )
    assert stale.status_code == 422
    minor = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "minor-missing@example.com",
            "password": "Str0ngP@ss!",
            "username": "minormissing",
            "birth_date": date.today().replace(year=date.today().year - 10).isoformat(),
            "pdn_version": PDN_CONSENT_VERSION,
            "offer_version": OFFER_VERSION,
        },
    )
    assert minor.status_code == 422


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
@patch("app.services.legal.send_guardian_consent_email", new_callable=AsyncMock)
async def test_minor_publication_waits_for_one_time_guardian_consent(
    guardian_email: AsyncMock, _verification: AsyncMock, client: AsyncClient
) -> None:
    birth_date = date.today().replace(year=date.today().year - 10).isoformat()
    registered = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "minor@example.com",
            "password": "Str0ngP@ss!",
            "username": "minoruser",
            "birth_date": birth_date,
            "pdn_version": PDN_CONSENT_VERSION,
            "offer_version": OFFER_VERSION,
            "guardian_email": "guardian@example.com",
        },
    )
    assert registered.status_code == 201, registered.text
    token = guardian_email.await_args.args[1]
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "minor@example.com", "password": "Str0ngP@ss!"},
    )
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    blocked = await client.post("/api/v1/sets", headers=headers, json={"title": "Публичный"})
    assert blocked.status_code == 403
    assert blocked.json()["details"]["reason"] == "GUARDIAN_CONSENT_REQUIRED"
    private = await client.post(
        "/api/v1/sets",
        headers=headers,
        json={"title": "Личный", "visibility": "private"},
    )
    assert private.status_code == 201

    confirmed = await client.post("/api/v1/auth/guardian-consent/confirm", json={"token": token})
    assert confirmed.status_code == 204
    reused = await client.post("/api/v1/auth/guardian-consent/confirm", json={"token": token})
    assert reused.status_code == 401
    published = await client.patch(
        f"/api/v1/sets/{private.json()['id']}",
        headers=headers,
        json={"title": "Личный", "visibility": "public"},
    )
    assert published.status_code == 200, published.text

    async with get_session_factory()() as db:
        request = await db.scalar(select(GuardianConsentRequest))
        assert request is not None
        assert request.token_hash != token
        assert request.confirmed_at is not None
        guardian = await db.scalar(select(Consent).where(Consent.kind == ConsentKind.guardian))
        assert guardian is not None


@patch("app.services.auth.send_verification_email", new_callable=AsyncMock)
async def test_legacy_account_must_set_immutable_birth_date(
    _email: AsyncMock, client: AsyncClient
) -> None:
    await client.post(
        "/api/v1/auth/register",
        json={
            "email": "legacy-age@example.com",
            "password": "Str0ngP@ss!",
            "username": "legacyage",
        },
    )
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "legacy-age@example.com", "password": "Str0ngP@ss!"},
    )
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    async with get_session_factory()() as db:
        await db.execute(
            update(User).where(User.email == "legacy-age@example.com").values(birth_date=None)
        )
        await db.commit()

    blocked = await client.post("/api/v1/sets", headers=headers, json={"title": "До возраста"})
    assert blocked.status_code == 403
    assert blocked.json()["details"]["reason"] == "BIRTH_DATE_REQUIRED"
    profile = await client.patch(
        "/api/v1/auth/me",
        headers=headers,
        json={
            "username": "legacyage",
            "display_name": None,
            "locale": "ru",
            "timezone": "Europe/Moscow",
            "birth_date": "2000-01-01",
        },
    )
    assert profile.status_code == 200, profile.text
    assert (
        await client.post("/api/v1/sets", headers=headers, json={"title": "После возраста"})
    ).status_code == 201
    changed = await client.patch(
        "/api/v1/auth/me",
        headers=headers,
        json={
            "username": "legacyage",
            "display_name": None,
            "locale": "ru",
            "timezone": "Europe/Moscow",
            "birth_date": "2001-01-01",
        },
    )
    assert changed.status_code == 409
