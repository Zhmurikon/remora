"""Личные курсы: минимальная оболочка E6A, без публичной выдачи черновиков."""

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import current_user, optional_user, public_read_limit
from app.core.config import get_settings
from app.core.rate_limit import enforce_rate_limit
from app.db.session import get_db
from app.models.user import User
from app.schemas.attachments import (
    AttachmentDownload,
    AttachmentUploadRequest,
    AttachmentUploadTicket,
    CourseAttachmentPublic,
)
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
from app.schemas.moderation import ReportCreate, ReportSubmitted
from app.schemas.search import CourseSearchItem
from app.services.agent import AgentService
from app.services.attachments import AttachmentService
from app.services.course_editor import CourseEditorService
from app.services.courses import CourseService
from app.services.moderation import ModerationService

router = APIRouter(prefix="/courses", tags=["courses"])


@router.post(
    "/{course_id}/attachments/upload-url",
    response_model=AttachmentUploadTicket,
    status_code=201,
    summary="Начать загрузку вложения",
)
async def create_attachment_upload(
    course_id: UUID,
    body: AttachmentUploadRequest,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> AttachmentUploadTicket:
    return await AttachmentService(db).create_upload(user, course_id, body)


@router.post(
    "/{course_id}/attachments/{attachment_id}/complete",
    response_model=CourseAttachmentPublic,
    summary="Завершить загрузку вложения",
)
async def complete_attachment_upload(
    course_id: UUID,
    attachment_id: UUID,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> CourseAttachmentPublic:
    return await AttachmentService(db).complete(user, course_id, attachment_id)


@router.get(
    "/{course_id}/attachments",
    response_model=list[CourseAttachmentPublic],
    summary="Вложения курса",
)
async def list_attachments(
    course_id: UUID,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> list[CourseAttachmentPublic]:
    return await AttachmentService(db).list(user, course_id)


@router.get(
    "/{course_id}/attachments/{attachment_id}/download",
    response_model=AttachmentDownload,
    summary="Ссылка на скачивание вложения",
)
async def download_attachment(
    course_id: UUID,
    attachment_id: UUID,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> AttachmentDownload:
    return await AttachmentService(db).download(user, course_id, attachment_id)


@router.delete(
    "/{course_id}/attachments/{attachment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Удалить вложение",
)
async def delete_attachment(
    course_id: UUID,
    attachment_id: UUID,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    await AttachmentService(db).delete(user, course_id, attachment_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/sitemap",
    response_model=list[CourseSitemapEntry],
    summary="Карта публичных курсов",
    dependencies=[Depends(public_read_limit)],
)
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
    dependencies=[Depends(public_read_limit)],
)
async def public_article(
    slug: str,
    article_id: UUID,
    db: AsyncSession = Depends(get_db),
    after: int | None = Query(default=None, ge=0),
    revision: datetime | None = None,
) -> PublicSet:
    return await CourseService(db).public_article(slug, article_id, after=after, revision=revision)


@router.get(
    "/public/{slug}",
    response_model=CourseDetail,
    summary="Опубликованный курс",
    dependencies=[Depends(public_read_limit)],
)
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
    dependencies=[Depends(public_read_limit)],
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


@router.post(
    "/public/{slug}/report",
    response_model=ReportSubmitted,
    status_code=201,
    summary="Пожаловаться на курс",
)
async def report_course(
    slug: str,
    body: ReportCreate,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> ReportSubmitted:
    settings = get_settings()
    await enforce_rate_limit(
        scope="course-report",
        ip="",
        identity=str(user.id),
        limit=settings.rate_limit_report,
        window_seconds=settings.rate_limit_report_window_seconds,
    )
    return await ModerationService(db).report(user, slug, body)


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


@router.get("/{course_id}", response_model=CourseDetail, summary="Чтение доступного курса")
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


@router.delete("/{course_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Удалить курс")
async def delete_course(
    course_id: UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> Response:
    await CourseService(db).delete(user, course_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
