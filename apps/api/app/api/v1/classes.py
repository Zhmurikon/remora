"""HTTP API первого среза учебных классов."""

from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.classes import (
    ClassroomCreate,
    ClassroomDetailOut,
    ClassroomMemberAdd,
    ClassroomMemberOut,
    ClassroomOut,
    ClassroomUpdate,
)
from app.services.classes import ClassroomService

router = APIRouter(prefix="/classes", tags=["classes"])


@router.get("", response_model=list[ClassroomOut], summary="Мои классы")
async def list_classes(
    user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> list[ClassroomOut]:
    return await ClassroomService(db).list_mine(user)


@router.post(
    "", response_model=ClassroomOut, status_code=status.HTTP_201_CREATED, summary="Создать класс"
)
async def create_class(
    body: ClassroomCreate,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> ClassroomOut:
    return await ClassroomService(db).create(user, body)


@router.get("/{class_id}", response_model=ClassroomDetailOut, summary="Открыть класс")
async def get_class(
    class_id: UUID,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> ClassroomDetailOut:
    return await ClassroomService(db).get(user, class_id)


@router.patch("/{class_id}", response_model=ClassroomOut, summary="Изменить класс")
async def update_class(
    class_id: UUID,
    body: ClassroomUpdate,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> ClassroomOut:
    return await ClassroomService(db).update(user, class_id, body)


@router.post(
    "/{class_id}/members",
    response_model=ClassroomMemberOut,
    status_code=status.HTTP_201_CREATED,
    summary="Добавить участника",
)
async def add_class_member(
    class_id: UUID,
    body: ClassroomMemberAdd,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> ClassroomMemberOut:
    return await ClassroomService(db).add_member(user, class_id, body)
