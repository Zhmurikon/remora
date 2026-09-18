from uuid import UUID

from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import current_user
from app.core.rate_limit import enforce_rate_limit
from app.db.session import get_db
from app.models.user import User
from app.schemas.api_tokens import ApiTokenCreate, ApiTokenCreated, ApiTokenPublic
from app.services.api_tokens import ApiTokenService

router = APIRouter(prefix="/users/me/api-tokens", tags=["api-tokens"])


@router.get("", response_model=list[ApiTokenPublic])
async def list_tokens(
    response: Response, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> list[ApiTokenPublic]:
    response.headers["Cache-Control"] = "no-store"
    return await ApiTokenService(db).list(user)


@router.post("", response_model=ApiTokenCreated, status_code=201)
async def create_token(
    body: ApiTokenCreate,
    response: Response,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> ApiTokenCreated:
    await enforce_rate_limit(
        scope="api-token-create", ip="", identity=str(user.id), limit=20, window_seconds=3600
    )
    response.headers["Cache-Control"] = "no-store"
    return await ApiTokenService(db).create(user, body)


@router.delete("/{token_id}", status_code=204)
async def revoke_token(
    token_id: UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> None:
    await ApiTokenService(db).revoke(user, token_id)
