"""Личные курсы: минимальная оболочка E6A, без публичной выдачи черновиков."""

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.content import PublicSet
from app.schemas.courses import (
    CourseCreate,
    CourseDetail,
    CourseMetadata,
    CoursePublication,
    CourseSummary,
)
from app.services.courses import CourseService

router = APIRouter(prefix="/courses", tags=["courses"])


@router.get(
    "/public/{slug}/articles/{article_id}",
    response_model=PublicSet,
    summary="Карточки статьи курса",
)
async def public_article(
    slug: str,
    article_id: UUID,
    db: AsyncSession = Depends(get_db),
    after: int | None = Query(default=None, ge=0),
    revision: datetime | None = None,
) -> PublicSet:
    return await CourseService(db).public_article(slug, article_id, after=after, revision=revision)


@router.get("/public/{slug}", response_model=CourseDetail, summary="Опубликованный курс")
async def public_course(slug: str, db: AsyncSession = Depends(get_db)) -> CourseDetail:
    return await CourseService(db).public_detail(slug)


@router.post("/{course_id}/publish", response_model=CourseDetail, summary="Опубликовать курс")
async def publish_course(
    course_id: UUID,
    body: CoursePublication,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> CourseDetail:
    return await CourseService(db).publish(user, course_id, body)


@router.post(
    "/{course_id}/unpublish", response_model=CourseDetail, summary="Снять курс с публикации"
)
async def unpublish_course(
    course_id: UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> CourseDetail:
    return await CourseService(db).unpublish(user, course_id)


@router.get("", response_model=list[CourseSummary], summary="Мои курсы")
async def list_courses(
    user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> list[CourseSummary]:
    return await CourseService(db).list_owned(user)


@router.post("", response_model=CourseDetail, status_code=201, summary="Создать курс из набора")
async def create_course(
    body: CourseCreate, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> CourseDetail:
    return await CourseService(db).create(user, body)


@router.get("/{course_id}", response_model=CourseDetail, summary="Структура моего курса")
async def get_course(
    course_id: UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> CourseDetail:
    return await CourseService(db).detail(user, course_id)


@router.put("/{course_id}", response_model=CourseDetail, summary="Изменить описание курса")
async def update_course(
    course_id: UUID,
    body: CourseMetadata,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> CourseDetail:
    return await CourseService(db).update(user, course_id, body)
