"""Задача объединяет источники; документ курса остаётся единственным редактируемым текстом."""

from __future__ import annotations

from uuid import UUID, uuid5

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, NotFoundError, ValidationError
from app.models.generations import AssistantTask, GenerationJob, NoteRevision
from app.models.transcriptions import TranscriptionStatus
from app.models.user import User
from app.repositories.api_tokens import lock_request
from app.schemas.assistant import (
    AssistantCreate,
    AssistantOptions,
    NoteApplyRequest,
    NoteCourseRequest,
    NoteRefineRequest,
)
from app.schemas.courses import ArticleWrite, CourseCreate, CourseStructureWrite, SectionWrite
from app.schemas.generations import GenerationCreate, GenerationUpdate
from app.services.course_editor import CourseEditorService
from app.services.courses import CourseService
from app.services.entitlements import Entitlements
from app.services.generations import GenerationService
from app.services.transcriptions import TranscriptionService


class AssistantService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.generations = GenerationService(db)

    async def list_tasks(self, user: User) -> list[AssistantTask]:
        return list(
            (
                await self.db.scalars(
                    select(AssistantTask)
                    .where(AssistantTask.user_id == user.id)
                    .order_by(AssistantTask.created_at.desc())
                )
            ).all()
        )

    async def get(self, user: User, task_id: UUID) -> AssistantTask:
        task = await self.db.scalar(
            select(AssistantTask).where(
                AssistantTask.id == task_id, AssistantTask.user_id == user.id
            )
        )
        if task is None:
            raise NotFoundError("Задача не найдена")
        return task

    async def create(self, user: User, body: AssistantCreate) -> AssistantTask:
        await lock_request(self.db, user.id)
        existing = await self.db.scalar(
            select(AssistantTask).where(
                AssistantTask.user_id == user.id, AssistantTask.request_id == body.request_id
            )
        )
        if existing:
            if (
                existing.source_ids != [str(k) for k in body.source_ids]
                or existing.result != body.result
                or existing.options != body.options.model_dump(mode="json")
            ):
                raise ConflictError("Идентификатор задачи уже использован")
            return existing
        if len(set(body.source_ids)) != len(body.source_ids):
            raise ValidationError("Источник повторяется")
        entitlement = Entitlements(self.db)
        await entitlement.require_feature(
            user, "ai.transcription" if body.result == "transcript" else "ai.generation"
        )
        await entitlement.check(
            user, "ai.sources_per_task", current=0, requested=len(body.source_ids)
        )
        attached = {key for task in await self.list_tasks(user) for key in task.source_ids}
        for source_id in body.source_ids:
            if str(source_id) in attached:
                raise ConflictError("Источник уже используется в другой задаче")
            await TranscriptionService(self.db).get_for_user(user, source_id)
        if body.options.destination == "existing":
            if not body.options.course_id:
                raise ValidationError("Выберите курс")
            await CourseService(self.db).owned(user, body.options.course_id)
        task = AssistantTask(
            user_id=user.id,
            request_id=body.request_id,
            source_id=body.source_ids[0],
            source_ids=[str(k) for k in body.source_ids],
            result=body.result,
            options=body.options.model_dump(mode="json"),
            status="waiting",
        )
        self.db.add(task)
        await self.db.flush()
        return task

    async def retry(self, user: User, task_id: UUID) -> AssistantTask:
        await lock_request(self.db, user.id)
        task = await self.get(user, task_id)
        if task.status != "failed":
            raise ConflictError("Повтор доступен только после ошибки")
        for source_id in task.source_ids:
            source = await TranscriptionService(self.db).get_for_user(user, UUID(source_id))
            if source.status == TranscriptionStatus.failed:
                raise ConflictError("Загрузите исправленный исходный файл в новую задачу")
        task.options = {**task.options, "attempt": int(task.options.get("attempt", 0)) + 1}
        for attr in ("note_id", "cards_id"):
            job_id = getattr(task, attr)
            if job_id:
                job = await self.generations.get(user, job_id)
                if job.status == "failed":
                    setattr(task, attr, None)
        task.status, task.error_message = "waiting", None
        await self.db.flush()
        return task

    async def advance(self, user: User, task: AssistantTask) -> None:
        # Единственный захват на владельца согласован с квотами и генерацией.
        await lock_request(self.db, user.id)
        await self.db.refresh(task)
        if task.status in {"completed", "failed"}:
            return
        sources = [
            await TranscriptionService(self.db).get_for_user(user, UUID(key))
            for key in task.source_ids
        ]
        if any(s.status == TranscriptionStatus.failed for s in sources):
            raise ConflictError(
                "Один из источников не удалось обработать. Проверьте исходные файлы"
            )
        if any(s.status != TranscriptionStatus.completed for s in sources):
            return
        if task.result == "transcript":
            task.status = "completed"
            return
        options = AssistantOptions.model_validate(task.options)
        attempt = task.options.get("attempt", 0)
        if not task.note_id:
            is_public = False
            if options.destination == "existing" and options.course_id:
                course = await CourseService(self.db).owned(user, options.course_id)
                is_public = course.is_published
            note = await self.generations.create(
                user,
                task.source_id,
                GenerationCreate(
                    request_id=uuid5(task.id, f"notes:{attempt}"),
                    kind="notes",
                    is_public=is_public,
                    source_ids=[UUID(k) for k in task.source_ids],
                    detail=options.detail,
                    formulas=options.formulas,
                    diagrams=options.diagrams,
                ),
            )
            task.note_id = note.id
        note = await self.generations.get(user, task.note_id)
        task.status = "notes"
        if note.status == "failed":
            raise ConflictError(note.error_message or "Не удалось создать конспект")
        if note.status != "completed":
            return
        if options.destination != "later" and not note.article_id:
            await self.attach(
                user,
                note.id,
                NoteCourseRequest(
                    revision=self.generations.public(note).updated_at,
                    course_id=options.course_id if options.destination == "existing" else None,
                    title=options.course_title or note.title[:160],
                ),
            )
        if task.result in {"both", "cards"}:
            if not task.cards_id:
                cards = await self.generations.create(
                    user,
                    task.source_id,
                    GenerationCreate(
                        request_id=uuid5(task.id, f"cards:{attempt}"),
                        kind="cards",
                        parent_id=note.id,
                        card_count=options.card_count,
                    ),
                )
                task.cards_id = cards.id
            cards = await self.generations.get(user, task.cards_id)
            task.status = "cards"
            if cards.status == "failed":
                raise ConflictError(cards.error_message or "Не удалось создать карточки")
            if cards.status != "completed":
                return
        task.status = "completed"

    async def attach(self, user: User, note_id: UUID, body: NoteCourseRequest) -> GenerationJob:
        await lock_request(self.db, user.id)
        note = await self.generations.get(user, note_id, lock=True)
        if note.article_id:
            return note
        self.generations._editable(note, body.revision)
        if note.kind != "notes" or (note.edit_metadata or {}).get("refinement"):
            raise ValidationError("Выберите готовый конспект")
        course_service = CourseService(self.db)
        if body.course_id:
            course = await course_service.owned(user, body.course_id)
            if course.is_published and not note.is_public:
                raise ConflictError(
                    "Сначала откройте доступ к конспекту или выберите закрытый курс"
                )
            course_id = course.id
        else:
            course_id = (
                await course_service.create(
                    user,
                    CourseCreate(
                        title=body.title.strip() or note.title[:160], is_published=note.is_public
                    ),
                )
            ).id
        editor = CourseEditorService(self.db)
        detail = await editor.detail(user, course_id)
        sections = [
            SectionWrite(
                id=s.id,
                title=s.title,
                articles=[
                    ArticleWrite(id=a.id, set_id=a.set_id, title=a.title, body=a.body)
                    for a in s.articles
                ],
            )
            for s in detail.sections
        ]
        if not sections:
            sections = [SectionWrite(title="Конспекты")]
        if body.course_id:
            article = ArticleWrite(title=note.title[:160], body=note.markdown or "")
            sections[-1].articles.append(article)
        else:
            article = sections[0].articles[0]
            article.title, article.body = note.title[:160], note.markdown or ""
        result = await editor.save(
            user, course_id, CourseStructureWrite(revision=detail.revision, sections=sections)
        )
        note.article_id = (
            result.sections[-1].articles[-1].id
            if body.course_id
            else result.sections[0].articles[0].id
        )
        note.course_id = course_id
        await self.db.flush()
        await self.db.refresh(note)
        return note

    async def refine(self, user: User, note_id: UUID, body: NoteRefineRequest) -> GenerationJob:
        note = await self.generations.get(user, note_id)
        if body.scope == "fragment" and not body.fragment:
            raise ValidationError("Выделите фрагмент")
        return await self.generations.create(
            user,
            note.transcription_id,
            GenerationCreate(
                request_id=body.request_id,
                kind="notes",
                is_public=False,
                parent_id=note.id,
                instruction=body.instruction,
                fragment=body.fragment if body.scope == "fragment" else None,
                revision=body.revision,
            ),
        )

    async def apply(self, user: User, note_id: UUID, body: NoteApplyRequest) -> GenerationJob:
        await lock_request(self.db, user.id)
        proposal = await self.generations.get(user, body.proposal_id)
        note = await self.generations.get(user, note_id)
        meta = proposal.edit_metadata or {}
        if (
            proposal.parent_id != note.id
            or not meta.get("refinement")
            or proposal.status != "completed"
        ):
            raise ConflictError("Предложение не готово или относится к другому документу")
        if meta.get("applied"):
            return note
        current = self.generations.public(note)
        if meta.get("revision") != current.updated_at.isoformat():
            raise ConflictError("Конспект изменился после запроса. Подготовьте правку заново")
        markdown = proposal.markdown or ""
        fragment = meta.get("fragment")
        if fragment:
            if (current.markdown or "").count(fragment) != 1:
                raise ConflictError("Исходный фрагмент изменился")
            markdown = (current.markdown or "").replace(fragment, markdown, 1)
        note = await self.generations.update(
            user, note_id, GenerationUpdate(revision=body.revision, markdown=markdown)
        )
        proposal.edit_metadata = {**meta, "applied": True}
        await self.db.flush()
        return note

    async def revisions(self, user: User, note_id: UUID) -> list[NoteRevision]:
        await self.generations.get(user, note_id)
        return list(
            (
                await self.db.scalars(
                    select(NoteRevision)
                    .where(NoteRevision.note_id == note_id)
                    .order_by(NoteRevision.created_at.desc())
                    .limit(50)
                )
            ).all()
        )
