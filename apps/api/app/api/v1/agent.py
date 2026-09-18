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
    AgentSetDetail,
    AgentSetUpdate,
    AgentSetWrite,
    AgentStructureDelete,
)
from app.schemas.api_tokens import AgentScope
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
from app.services.api_tokens import ApiTokenService
from app.services.content import ContentService
from app.services.course_editor import CourseEditorService
from app.services.courses import CourseService

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
        await enforce_rate_limit(
            scope="agent-api", ip="", identity=str(user.id), limit=120, window_seconds=60
        )
        response.headers["Cache-Control"] = "no-store"
        return user

    return dependency


read_user = require_scope("materials:read")
write_user = require_scope("materials:write")
publish_user = require_scope("courses:publish")


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
