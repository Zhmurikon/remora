"""Публичный поиск курсов."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.schemas.search import CourseSearchQuery, CourseSearchResult
from app.services.search import search_courses

router = APIRouter(prefix="/search", tags=["search"])


@router.get("/courses", response_model=CourseSearchResult, summary="Поиск публичных курсов")
async def courses(
    query: Annotated[CourseSearchQuery, Query()],
    db: AsyncSession = Depends(get_db),
) -> CourseSearchResult:
    return await search_courses(db, query)
