"""Публичный поиск курсов."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.schemas.search import CourseSearchItem, CourseSearchQuery, CourseSearchResult
from app.services.search import search_courses, selected_courses

router = APIRouter(prefix="/search", tags=["search"])


@router.get(
    "/courses/selected", response_model=list[CourseSearchItem], summary="Выбранные публичные курсы"
)
async def selected(
    response: Response,
    ids: Annotated[list[UUID], Query(min_length=1, max_length=50)],
    db: AsyncSession = Depends(get_db),
) -> list[CourseSearchItem]:
    response.headers["Cache-Control"] = "no-store"
    return await selected_courses(db, ids)


@router.get("/courses", response_model=CourseSearchResult, summary="Поиск публичных курсов")
async def courses(
    query: Annotated[CourseSearchQuery, Query()],
    db: AsyncSession = Depends(get_db),
) -> CourseSearchResult:
    return await search_courses(db, query)
