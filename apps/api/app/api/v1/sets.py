"""CRUD пользовательских наборов и атомарное сохранение карточек."""

from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.content import CardBatch, SetCreate, SetDetail, SetSummary, SetUpdate
from app.services.content import ContentService

router = APIRouter(prefix="/sets", tags=["sets"])


@router.get("", response_model=list[SetSummary], summary="Мои наборы")
async def list_sets(
    user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> list[SetSummary]:
    sets = await ContentService(db).list_sets(user)
    return [SetSummary.model_validate(item) for item in sets]


@router.post(
    "", response_model=SetDetail, status_code=status.HTTP_201_CREATED, summary="Создать набор"
)
async def create_set(
    body: SetCreate, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> SetDetail:
    study_set = await ContentService(db).create_set(user, body)
    loaded = await ContentService(db).get_owned_set(user, study_set.id, with_cards=True)
    return SetDetail.model_validate(loaded)


@router.get("/{set_id}", response_model=SetDetail, summary="Получить набор")
async def get_set(
    set_id: UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> SetDetail:
    study_set = await ContentService(db).get_owned_set(user, set_id, with_cards=True)
    return SetDetail.model_validate(study_set)


@router.patch("/{set_id}", response_model=SetDetail, summary="Изменить набор")
async def update_set(
    set_id: UUID,
    body: SetUpdate,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> SetDetail:
    study_set = await ContentService(db).update_set(user, set_id, body)
    return SetDetail.model_validate(study_set)


@router.delete("/{set_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Удалить набор")
async def delete_set(
    set_id: UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> None:
    await ContentService(db).delete_set(user, set_id)


@router.post(
    "/{set_id}/duplicate",
    response_model=SetDetail,
    status_code=status.HTTP_201_CREATED,
    summary="Дублировать набор",
)
async def duplicate_set(
    set_id: UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> SetDetail:
    study_set = await ContentService(db).duplicate_set(user, set_id)
    return SetDetail.model_validate(study_set)


@router.put("/{set_id}/cards", response_model=SetDetail, summary="Сохранить карточки")
async def sync_cards(
    set_id: UUID,
    body: CardBatch,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> SetDetail:
    study_set = await ContentService(db).sync_cards(user, set_id, body)
    return SetDetail.model_validate(study_set)
