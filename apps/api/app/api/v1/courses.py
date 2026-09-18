"""Личные курсы: минимальная оболочка E6A, без публичной выдачи черновиков."""

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import current_user, optional_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.content import PublicSet
from app.schemas.courses import (
    CourseCopyRequest,
    CourseCreate,
    CourseDetail,
    CourseEditorDetail,
    CourseMetadata,
    CoursePublication,
    CourseSitemapEntry,
    CourseStructureWrite,
    CourseSummary,
)
from app.schemas.search import CourseSearchItem
from app.services.agent import AgentService
from app.services.course_editor import CourseEditorService
from app.services.courses import CourseService

router = APIRouter(prefix="/courses", tags=["courses"])


@router.get("/sitemap", response_model=list[CourseSitemapEntry], summary="Карта публичных курсов")
async def course_sitemap(db: AsyncSession = Depends(get_db)) -> list[CourseSitemapEntry]:
    return await CourseService(db).sitemap()


@router.get("/{course_id}/editor", response_model=CourseEditorDetail)
async def course_editor(
    course_id: UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> CourseEditorDetail:
    return await CourseEditorService(db).detail(user, course_id)


@router.put("/{course_id}/structure", response_model=CourseEditorDetail)
async def save_structure(
    course_id: UUID,
    body: CourseStructureWrite,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
    idempotency_key: str = Header(min_length=1, max_length=128, pattern=r"^[a-zA-Z0-9_.:-]+$"),
) -> CourseEditorDetail:
    result = await AgentService(db).once(
        user,
        idempotency_key,
        f"structure:{course_id}",
        body,
        lambda: CourseEditorService(db).save(user, course_id, body),
    )
    return CourseEditorDetail.model_validate(result)


@router.post("/{course_id}/copy", response_model=CourseEditorDetail, status_code=201)
async def copy_course(
    course_id: UUID,
    body: CourseCopyRequest,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
    idempotency_key: str = Header(min_length=1, max_length=128, pattern=r"^[a-zA-Z0-9_.:-]+$"),
) -> CourseEditorDetail:
    return await CourseEditorService(db).copy_once(user, course_id, body, idempotency_key)


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
async def public_course(
    slug: str,
    viewer: User | None = Depends(optional_user),
    db: AsyncSession = Depends(get_db),
) -> CourseDetail:
    return await CourseService(db).public_detail(slug, viewer)


@router.get(
    "/public/{slug}/related",
    response_model=list[CourseSearchItem],
    summary="Похожие курсы",
)
async def related_courses(
    slug: str,
    limit: int = Query(default=4, ge=1, le=12),
    db: AsyncSession = Depends(get_db),
) -> list[CourseSearchItem]:
    return await CourseService(db).related(slug, limit)


@router.post("/public/{slug}/like", response_model=CourseDetail, summary="Поставить лайк курсу")
async def like_course(
    slug: str, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> CourseDetail:
    return await CourseService(db).like(user, slug)


@router.delete("/public/{slug}/like", response_model=CourseDetail, summary="Убрать лайк с курса")
async def unlike_course(
    slug: str, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> CourseDetail:
    return await CourseService(db).unlike(user, slug)


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
