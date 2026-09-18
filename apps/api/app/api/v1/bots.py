from uuid import UUID

from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import current_user
from app.core.rate_limit import enforce_rate_limit
from app.db.session import get_db
from app.models.user import User
from app.schemas.bots import BotCodeCreated, BotCodeRequest, BotLinkPublic
from app.services.bots import BotService

router = APIRouter(prefix="/users/me/bots", tags=["bots"])


@router.get("", response_model=list[BotLinkPublic])
async def list_links(
    response: Response, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> list[BotLinkPublic]:
    response.headers["Cache-Control"] = "no-store"
    return await BotService(db).list_links(user)


@router.post("/code", response_model=BotCodeCreated, status_code=201)
async def create_code(
    body: BotCodeRequest,
    response: Response,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> BotCodeCreated:
    await enforce_rate_limit(
        scope="bot-code", ip="", identity=str(user.id), limit=20, window_seconds=3600
    )
    response.headers["Cache-Control"] = "no-store"
    return await BotService(db).create_code(user, body.platform)


@router.delete("/{link_id}", status_code=204)
async def revoke(
    link_id: UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> None:
    await BotService(db).revoke(user, link_id)
