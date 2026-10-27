from collections.abc import Awaitable, Callable
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import UnauthorizedError
from app.core.rate_limit import enforce_rate_limit
from app.db.session import get_db
from app.models.user import User
from app.schemas.agent import (
    AgentCourseDetail,
    AgentCourseUpdate,
    AgentCourseWrite,
    AgentFolderCreate,
    AgentFolderDelete,
    AgentFolderDetail,
    AgentFolderUpdate,
    AgentMediaUpload,
    AgentMediaUploadResult,
    AgentSetDetail,
    AgentSetUpdate,
    AgentSetWrite,
    AgentStructureDelete,
)
from app.schemas.api_tokens import AgentScope
from app.schemas.blog import BlogPostDetail, BlogPostUpdate, BlogPostWrite, BlogPublication
from app.schemas.content import SetSummary
from app.schemas.courses import (
    CourseCopyRequest,
    CourseDetail,
    CourseEditorDetail,
    CoursePublication,
    CourseStructureWrite,
    CourseSummary,
)
from app.services.agent import AgentService
from app.services.agent_media import AgentMediaService
from app.services.api_tokens import ApiTokenService
from app.services.blog import BlogService
from app.services.content import ContentService
from app.services.course_editor import CourseEditorService
from app.services.courses import CourseService
from app.services.entitlements import Entitlements, week_period

router = APIRouter(prefix="/agent", tags=["agent"])
bearer = HTTPBearer(auto_error=False, scheme_name="PersonalApiToken")
RequestKey = Annotated[
    str,
    Header(alias="Idempotency-Key", min_length=1, max_length=128, pattern=r"^[a-zA-Z0-9_.:-]+$"),
]


def require_scope(scope: AgentScope) -> Callable[..., Awaitable[User]]:
    async def dependency(
        response: Response,
        db: AsyncSession = Depends(get_db),
        creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    ) -> User:
        if creds is None:
            raise UnauthorizedError("Нужен персональный API-токен")
        user = await ApiTokenService(db).authenticate(creds.credentials, scope)
        if scope not in {"materials:read", "blog:read"}:
            period_key, resets_at = week_period()
            await Entitlements(db).consume(
                user,
                "agent.writes_per_week",
                amount=1,
                period_key=period_key,
                resets_at=resets_at,
            )
        await enforce_rate_limit(
            scope="agent-api", ip="", identity=str(user.id), limit=120, window_seconds=60
        )
        response.headers["Cache-Control"] = "no-store"
        return user

    return dependency


read_user = require_scope("materials:read")
write_user = require_scope("materials:write")
publish_user = require_scope("courses:publish")
blog_read_user = require_scope("blog:read")
blog_write_user = require_scope("blog:write")
blog_publish_user = require_scope("blog:publish")


@router.post("/blog/media", response_model=AgentMediaUploadResult, status_code=201)
async def upload_blog_image(
    body: AgentMediaUpload,
    key: RequestKey,
    user: User = Depends(blog_write_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    return await AgentService(db).once(
        user,
        key,
        "upload-blog-media",
        body,
        lambda: AgentMediaService(db).upload(user, body),
    )


@router.get("/blog/posts", response_model=list[BlogPostDetail])
async def list_blog_posts(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
    user: User = Depends(blog_read_user),
    db: AsyncSession = Depends(get_db),
) -> list[BlogPostDetail]:
    return await BlogService(db).list_owned(user, offset=offset, limit=limit)


@router.get("/blog/posts/{post_id}", response_model=BlogPostDetail)
async def get_blog_post(
    post_id: UUID,
    user: User = Depends(blog_read_user),
    db: AsyncSession = Depends(get_db),
) -> BlogPostDetail:
    return BlogService._detail(await BlogService(db).owned(user, post_id))


@router.post("/blog/posts", response_model=BlogPostDetail, status_code=201)
async def create_blog_post(
    body: BlogPostWrite,
    key: RequestKey,
    user: User = Depends(blog_write_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    service = AgentService(db)
    return await service.once(
        user, key, "create-blog-post", body, lambda: BlogService(db).create(user, body)
    )


@router.put("/blog/posts/{post_id}", response_model=BlogPostDetail)
async def update_blog_post(
    post_id: UUID,
    body: BlogPostUpdate,
    key: RequestKey,
    user: User = Depends(blog_write_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    service = AgentService(db)
    return await service.once(
        user,
        key,
        f"update-blog-post:{post_id}",
        body,
        lambda: BlogService(db).update(user, post_id, body),
    )


@router.post("/blog/posts/{post_id}/publish", response_model=BlogPostDetail)
async def publish_blog_post(
    post_id: UUID,
    body: BlogPublication,
    key: RequestKey,
    user: User = Depends(blog_publish_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    service = AgentService(db)
    return await service.once(
        user,
        key,
        f"publish-blog-post:{post_id}",
        body,
        lambda: BlogService(db).publish(user, post_id, body.revision),
    )


@router.post("/blog/posts/{post_id}/unpublish", response_model=BlogPostDetail)
async def unpublish_blog_post(
    post_id: UUID,
    body: BlogPublication,
    key: RequestKey,
    user: User = Depends(blog_publish_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    service = AgentService(db)
    return await service.once(
        user,
        key,
        f"unpublish-blog-post:{post_id}",
        body,
        lambda: BlogService(db).unpublish(user, post_id, body.revision),
    )


@router.get("/folders", response_model=list[AgentFolderDetail])
async def list_folders(
    user: User = Depends(read_user), db: AsyncSession = Depends(get_db)
) -> list[AgentFolderDetail]:
    return await AgentService(db).list_folders(user)


@router.post("/folders", response_model=AgentFolderDetail, status_code=201)
async def create_folder(
    body: AgentFolderCreate,
    key: RequestKey,
    user: User = Depends(write_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    service = AgentService(db)
    return await service.once(
        user, key, "create-folder", body, lambda: service.create_folder(user, body)
    )


@router.put("/folders/{folder_id}", response_model=AgentFolderDetail)
async def update_folder(
    folder_id: UUID,
    body: AgentFolderUpdate,
    key: RequestKey,
    user: User = Depends(write_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    service = AgentService(db)
    return await service.once(
        user,
        key,
        f"update-folder:{folder_id}",
        body,
        lambda: service.update_folder(user, folder_id, body),
    )


@router.post("/folders/{folder_id}/delete", response_model=AgentFolderDetail)
async def delete_folder(
    folder_id: UUID,
    body: AgentFolderDelete,
    key: RequestKey,
    user: User = Depends(write_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    service = AgentService(db)
    return await service.once(
        user,
        key,
        f"delete-folder:{folder_id}",
        body,
        lambda: service.delete_folder(user, folder_id, body.revision),
    )


@router.post("/media", response_model=AgentMediaUploadResult, status_code=201)
async def upload_media(
    body: AgentMediaUpload,
    key: RequestKey,
    user: User = Depends(write_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    return await AgentService(db).once(
        user,
        key,
        "upload-media",
        body,
        lambda: AgentMediaService(db).upload(user, body),
    )


@router.get("/courses/{course_id}/structure", response_model=CourseEditorDetail)
async def get_course_structure(
    course_id: UUID, user: User = Depends(read_user), db: AsyncSession = Depends(get_db)
) -> CourseEditorDetail:
    return await CourseEditorService(db).detail(user, course_id)


@router.put("/courses/{course_id}/structure", response_model=CourseEditorDetail)
async def update_course_structure(
    course_id: UUID,
    body: CourseStructureWrite,
    key: RequestKey,
    user: User = Depends(write_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    return await AgentService(db).once(
        user,
        key,
        f"agent-structure:{course_id}",
        body,
        lambda: CourseEditorService(db).save_agent_structure(user, course_id, body),
    )


@router.post("/courses/{course_id}/copy", response_model=CourseEditorDetail, status_code=201)
async def copy_course(
    course_id: UUID,
    body: CourseCopyRequest,
    key: RequestKey,
    user: User = Depends(write_user),
    db: AsyncSession = Depends(get_db),
) -> CourseEditorDetail:
    return await CourseEditorService(db).copy_once(user, course_id, body, key)


@router.post("/courses/{course_id}/articles/{article_id}/delete", response_model=CourseEditorDetail)
async def delete_course_article(
    course_id: UUID,
    article_id: UUID,
    body: AgentStructureDelete,
    key: RequestKey,
    user: User = Depends(write_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    return await AgentService(db).once(
        user,
        key,
        f"delete-article:{course_id}:{article_id}",
        body,
        lambda: CourseEditorService(db).remove_structure_item(
            user, course_id, article_id, body.revision, section=False
        ),
    )


@router.post("/courses/{course_id}/sections/{section_id}/delete", response_model=CourseEditorDetail)
async def delete_course_section(
    course_id: UUID,
    section_id: UUID,
    body: AgentStructureDelete,
    key: RequestKey,
    user: User = Depends(write_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    return await AgentService(db).once(
        user,
        key,
        f"delete-section:{course_id}:{section_id}",
        body,
        lambda: CourseEditorService(db).remove_structure_item(
            user, course_id, section_id, body.revision, section=True
        ),
    )


@router.get("/sets", response_model=list[SetSummary])
async def list_sets(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
    user: User = Depends(read_user),
    db: AsyncSession = Depends(get_db),
) -> list[SetSummary]:
    sets = await ContentService(db).list_sets(user, offset=offset, limit=limit)
    return [SetSummary.model_validate(s) for s in sets]


@router.get("/sets/{set_id}", response_model=AgentSetDetail)
async def get_set(
    set_id: UUID, user: User = Depends(read_user), db: AsyncSession = Depends(get_db)
) -> AgentSetDetail:
    return await AgentService(db).set_detail(user, set_id)


@router.post("/sets", response_model=AgentSetDetail, status_code=201)
async def create_set(
    body: AgentSetWrite,
    key: RequestKey,
    user: User = Depends(write_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    service = AgentService(db)
    return await service.once(user, key, "create-set", body, lambda: service.create_set(user, body))


@router.put("/sets/{set_id}", response_model=AgentSetDetail)
async def update_set(
    set_id: UUID,
    body: AgentSetUpdate,
    key: RequestKey,
    user: User = Depends(write_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    service = AgentService(db)
    return await service.once(
        user, key, f"update-set:{set_id}", body, lambda: service.update_set(user, set_id, body)
    )


@router.get("/courses", response_model=list[CourseSummary])
async def list_courses(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
    user: User = Depends(read_user),
    db: AsyncSession = Depends(get_db),
) -> list[CourseSummary]:
    return await CourseService(db).list_owned(user, offset=offset, limit=limit)


@router.get("/courses/{course_id}", response_model=AgentCourseDetail)
async def get_course(
    course_id: UUID, user: User = Depends(read_user), db: AsyncSession = Depends(get_db)
) -> AgentCourseDetail:
    return await AgentService(db).course_detail(user, course_id)


@router.post("/courses", response_model=AgentCourseDetail, status_code=201)
async def create_course(
    body: AgentCourseWrite,
    key: RequestKey,
    user: User = Depends(write_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    service = AgentService(db)
    return await service.once(
        user, key, "create-course", body, lambda: service.create_course(user, body)
    )


@router.put("/courses/{course_id}", response_model=AgentCourseDetail)
async def update_course(
    course_id: UUID,
    body: AgentCourseUpdate,
    key: RequestKey,
    user: User = Depends(write_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    service = AgentService(db)
    return await service.once(
        user,
        key,
        f"update-course:{course_id}",
        body,
        lambda: service.update_course(user, course_id, body),
    )


@router.post("/courses/{course_id}/publish", response_model=CourseDetail)
async def publish_course(
    course_id: UUID,
    body: CoursePublication,
    key: RequestKey,
    user: User = Depends(publish_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    service = AgentService(db)
    return await service.once(
        user,
        key,
        f"publish:{course_id}",
        body,
        lambda: CourseService(db).publish(user, course_id, body),
    )


@router.post("/courses/{course_id}/unpublish", response_model=CourseDetail)
async def unpublish_course(
    course_id: UUID,
    key: RequestKey,
    user: User = Depends(publish_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    service = AgentService(db)
    return await service.once(
        user,
        key,
        f"unpublish:{course_id}",
        CoursePublication(),
        lambda: CourseService(db).unpublish(user, course_id),
    )
