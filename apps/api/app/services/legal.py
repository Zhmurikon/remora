"""Фиксация согласий и ограничение публичных функций несовершеннолетних."""

from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.email import send_guardian_consent_email
from app.core.errors import ForbiddenError, UnauthorizedError
from app.core.legal import GUARDIAN_CONSENT_VERSION, OFFER_VERSION, PDN_CONSENT_VERSION
from app.core.security import generate_refresh_token, hash_token
from app.models.user import Consent, ConsentKind, GuardianConsentRequest, User


class LegalService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def record_registration(
        self,
        user: User,
        *,
        pdn_version: str,
        offer_version: str,
        ip: str | None,
        guardian_email: str | None,
    ) -> None:
        """Записывает согласия в одной транзакции с созданием аккаунта."""
        self.db.add_all(
            [
                Consent(user_id=user.id, kind=ConsentKind.pdn, version=pdn_version, ip=ip),
                Consent(user_id=user.id, kind=ConsentKind.offer, version=offer_version, ip=ip),
            ]
        )
        if not user.requires_guardian_consent:
            await self.db.flush()
            return
        if guardian_email is None:
            raise ForbiddenError("Требуется согласие законного представителя")
        await self.request_guardian(user, guardian_email)

    async def request_guardian(self, user: User, guardian_email: str) -> None:
        if user.email is not None and guardian_email.lower() == user.email.lower():
            raise ForbiddenError("Email представителя должен отличаться от email пользователя")
        token, token_hash = generate_refresh_token()
        request = await self.db.scalar(
            select(GuardianConsentRequest)
            .where(GuardianConsentRequest.user_id == user.id)
            .with_for_update()
        )
        if request is None:
            request = GuardianConsentRequest(user_id=user.id, guardian_email=guardian_email)
            self.db.add(request)
        request.guardian_email = guardian_email
        request.token_hash = token_hash
        request.document_version = GUARDIAN_CONSENT_VERSION
        request.expires_at = datetime.now(UTC) + timedelta(days=7)
        request.confirmed_at = None
        request.confirmation_ip = None
        await self.db.flush()
        await send_guardian_consent_email(guardian_email, token, user.username)

    async def confirm_guardian(self, token: str, ip: str | None) -> None:
        request = await self.db.scalar(
            select(GuardianConsentRequest)
            .where(GuardianConsentRequest.token_hash == hash_token(token))
            .with_for_update()
        )
        now = datetime.now(UTC)
        if request is None or request.confirmed_at is not None or request.expires_at <= now:
            raise UnauthorizedError("Ссылка уже использована или недействительна")
        user = await self.db.get(User, request.user_id)
        if user is None or not user.requires_guardian_consent:
            raise UnauthorizedError("Запрос согласия недействителен")
        request.confirmed_at = now
        request.confirmation_ip = ip
        self.db.add(
            Consent(
                user_id=user.id,
                kind=ConsentKind.guardian,
                version=request.document_version,
                ip=ip,
            )
        )
        await self.db.flush()

    async def ensure_publication_allowed(self, user: User) -> None:
        if user.birth_date is None:
            raise ForbiddenError(
                "Укажите дату рождения в настройках перед публикацией",
                details={"reason": "BIRTH_DATE_REQUIRED"},
            )
        if not user.requires_guardian_consent:
            return
        consent = await self.db.scalar(
            select(Consent.id).where(
                Consent.user_id == user.id,
                Consent.kind == ConsentKind.guardian,
                Consent.version == GUARDIAN_CONSENT_VERSION,
            )
        )
        if consent is None:
            raise ForbiddenError(
                "Публичные функции станут доступны после согласия законного представителя",
                details={"reason": "GUARDIAN_CONSENT_REQUIRED"},
            )


def legal_versions() -> dict[str, str]:
    return {"pdn": PDN_CONSENT_VERSION, "offer": OFFER_VERSION}
