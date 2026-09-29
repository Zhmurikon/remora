"""API дневной активности и серии текущего пользователя."""

from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import current_user
from app.core.errors import ValidationError
from app.db.session import get_db
from app.models.user import User
from app.schemas.retention import AchievementCollection, ActivityDay, RetentionSummary
from app.services.achievements import AchievementService
from app.services.retention import RetentionService

router = APIRouter(prefix="/retention", tags=["retention"])


@router.get("/summary", response_model=RetentionSummary, summary="Дневная цель, серия и XP")
async def retention_summary(
    user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> RetentionSummary:
    return await RetentionService(db).summary(user)


@router.get("/activity", response_model=list[ActivityDay], summary="Активность по дням")
async def retention_activity(
    date_from: date = Query(alias="from"),
    date_to: date = Query(alias="to"),
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ActivityDay]:
    if date_to < date_from or date_to - date_from > timedelta(days=366):
        raise ValidationError("Диапазон должен составлять от 0 до 366 дней")
    return await RetentionService(db).activity(user, date_from, date_to)


@router.get("/achievements", response_model=AchievementCollection, summary="Коллекция достижений")
async def achievements(
    user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> AchievementCollection:
    return await AchievementService(db).collection(user)


@router.post(
    "/achievements/acknowledge",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Отметить новые достижения показанными",
)
async def acknowledge_achievements(
    user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> Response:
    await AchievementService(db).acknowledge(user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
