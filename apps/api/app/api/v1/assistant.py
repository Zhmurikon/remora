from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.assistant import (
    AssistantCreate,
    AssistantPublic,
    NoteApplyRequest,
    NoteCourseRequest,
    NoteRefineRequest,
    NoteRevisionPublic,
)
from app.schemas.generations import GenerationPublic
from app.services.assistant import AssistantService

router = APIRouter(tags=["assistant"])


@router.get("/assistant/tasks", response_model=list[AssistantPublic])
async def list_tasks(
    user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> list[AssistantPublic]:
    return [AssistantPublic.model_validate(t) for t in await AssistantService(db).list_tasks(user)]


@router.post("/assistant/tasks", response_model=AssistantPublic, status_code=201)
async def create_task(
    body: AssistantCreate, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> AssistantPublic:
    task = await AssistantService(db).create(user, body)
    await db.commit()
    return AssistantPublic.model_validate(task)


@router.post("/assistant/tasks/{task_id}/retry", response_model=AssistantPublic)
async def retry_task(
    task_id: UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> AssistantPublic:
    task = await AssistantService(db).retry(user, task_id)
    await db.commit()
    return AssistantPublic.model_validate(task)


@router.post("/generations/{note_id}/course", response_model=GenerationPublic)
async def attach_note(
    note_id: UUID,
    body: NoteCourseRequest,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> GenerationPublic:
    service = AssistantService(db)
    note = await service.attach(user, note_id, body)
    await db.commit()
    return service.generations.public(note)


@router.post("/generations/{note_id}/refine", response_model=GenerationPublic, status_code=202)
async def refine_note(
    note_id: UUID,
    body: NoteRefineRequest,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> GenerationPublic:
    service = AssistantService(db)
    proposal = await service.refine(user, note_id, body)
    await db.commit()
    return service.generations.public(proposal)


@router.post("/generations/{note_id}/apply", response_model=GenerationPublic)
async def apply_note(
    note_id: UUID,
    body: NoteApplyRequest,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> GenerationPublic:
    service = AssistantService(db)
    note = await service.apply(user, note_id, body)
    await db.commit()
    return service.generations.public(note)


@router.get("/generations/{note_id}/revisions", response_model=list[NoteRevisionPublic])
async def note_revisions(
    note_id: UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> list[NoteRevisionPublic]:
    return [
        NoteRevisionPublic.model_validate(v)
        for v in await AssistantService(db).revisions(user, note_id)
    ]
