from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.billing import EntitlementsPublic, PlanPublic
from app.services.entitlements import Entitlements
from app.services.plans import public_plans

router = APIRouter(prefix="/billing", tags=["billing"])


@router.get("/plans", response_model=list[PlanPublic], summary="Тарифы")
async def list_plans() -> list[PlanPublic]:
    return public_plans()


@router.get("/entitlements", response_model=EntitlementsPublic, summary="Мой тариф и квоты")
async def my_entitlements(
    response: Response,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> EntitlementsPublic:
    response.headers["Cache-Control"] = "no-store"
    resolved = await Entitlements(db).resolve(user)
    return EntitlementsPublic(**resolved.__dict__)
