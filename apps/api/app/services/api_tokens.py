import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ForbiddenError, NotFoundError, UnauthorizedError
from app.core.security import hash_token
from app.models.api_tokens import ApiToken
from app.models.user import User, UserStatus
from app.repositories import api_tokens as repo
from app.repositories import user as user_repo
from app.schemas.api_tokens import ApiTokenCreate, ApiTokenCreated, ApiTokenPublic


class ApiTokenService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create(self, user: User, body: ApiTokenCreate) -> ApiTokenCreated:
        raw = "rmr_" + secrets.token_urlsafe(48)
        token = ApiToken(
            user_id=user.id,
            name=body.name,
            prefix=raw[:12],
            token_hash=hash_token(raw),
            scopes=sorted(set(body.scopes)),
            expires_at=datetime.now(UTC) + timedelta(days=body.expires_in_days),
        )
        self.db.add(token)
        await self.db.flush()
        return ApiTokenCreated(**ApiTokenPublic.model_validate(token).model_dump(), token=raw)

    async def list(self, user: User) -> list[ApiTokenPublic]:
        return [ApiTokenPublic.model_validate(t) for t in await repo.list_tokens(self.db, user.id)]

    async def revoke(self, user: User, token_id: UUID) -> None:
        token = await repo.get_token(self.db, token_id)
        if token is None or token.user_id != user.id:
            raise NotFoundError("Токен не найден")
        token.revoked_at = token.revoked_at or datetime.now(UTC)
        await self.db.flush()

    async def authenticate(self, raw: str, scope: str) -> User:
        if not raw.startswith("rmr_") or len(raw) != 68:
            raise UnauthorizedError("Нужен персональный API-токен")
        token = await repo.by_hash(self.db, hash_token(raw))
        now = datetime.now(UTC)
        if token is None or token.revoked_at is not None or token.expires_at <= now:
            raise UnauthorizedError("API-токен недействителен, истёк или отозван")
        user = await user_repo.get_user_by_id(self.db, token.user_id)
        if user is None or user.status != UserStatus.active or user.deleted_at is not None:
            raise UnauthorizedError("Аккаунт недоступен")
        if scope not in token.scopes:
            raise ForbiddenError("У токена нет нужного права", details={"required_scope": scope})
        token.last_used_at = now
        await self.db.flush()
        return user
