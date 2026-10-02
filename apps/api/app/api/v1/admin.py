"""Минимальная административная панель только для чтения."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import admin_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.admin import AdminOverview, AdminUserList
from app.services.admin import AdminService

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/overview", response_model=AdminOverview, summary="Сводка продукта")
async def get_overview(
    _: User = Depends(admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminOverview:
    return await AdminService(db).overview()


@router.get("/users", response_model=AdminUserList, summary="Пользователи")
async def list_users(
    query: Annotated[str | None, Query(min_length=1, max_length=160)] = None,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    _: User = Depends(admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminUserList:
    normalized_query = query.strip() if query else None
    return await AdminService(db).users(
        query=normalized_query or None,
        offset=offset,
        limit=limit,
    )
