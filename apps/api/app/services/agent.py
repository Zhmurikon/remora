"""Атомарные операции агента поверх общих сервисов контента и курсов."""

import hashlib
import json
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel
from pydantic import ValidationError as SchemaError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.article_media import extract_media_ids
from app.core.errors import ConflictError, NotFoundError, ValidationError
from app.models.api_tokens import AgentRequest
from app.models.content import Card, Folder, SetVisibility
from app.models.courses import Course, CourseArticle, CourseSection
from app.models.user import User
from app.repositories import api_tokens as token_repo
from app.repositories import courses as course_repo
from app.schemas.agent import (
    AgentArticleDetail,
    AgentCardWrite,
    AgentCourseCreate,
    AgentCourseDetail,
    AgentCourseUpdate,
    AgentCourseWrite,
    AgentFolderCreate,
    AgentFolderDetail,
    AgentFolderUpdate,
    AgentSectionDetail,
    AgentSetDetail,
    AgentSetUpdate,
    AgentSetWrite,
    CardAppend,
    CardEdit,
    CardPage,
    SetEditResult,
    SetMove,
)
from app.schemas.content import (
    CardBatch,
    FolderCreate,
    FolderPublic,
    FolderUpdate,
    SetCreate,
    SetDetail,
    SetUpdate,
)
from app.schemas.courses import CourseCopyRequest, CourseSummary
from app.services.content import ContentService
from app.services.courses import CourseService
from app.services.entitlements import Entitlements, week_period
from app.services.search_sync import queue_course


def digest(value: object) -> str:
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()
    ).hexdigest()


class AgentService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.content = ContentService(db)
        self.courses = CourseService(db)

    async def once(
        self,
        user: User,
        key: str,
        operation: str,
        body: BaseModel | None,
        action: Callable[[], Awaitable[BaseModel]],
        *,
        count_agent_write: bool = True,
    ) -> dict[str, Any]:
        await token_repo.lock_request(self.db, user.id)
        # None — операция без тела: отпечаток определяется одним `operation`.
        payload = body.model_dump(mode="json") if body is not None else {}
        # Старый запрос копирования должен находить тот же результат после добавления режима текста.
        if isinstance(body, CourseCopyRequest) and not body.text_only:
            payload.pop("text_only")
        if isinstance(body, AgentSetWrite) and "visibility" not in body.model_fields_set:
            payload.pop("visibility", None)
        if isinstance(body, AgentCourseWrite):
            if "is_published" not in body.model_fields_set:
                payload.pop("is_published", None)
            for section, saved_section in zip(body.sections, payload["sections"], strict=True):
                for article, saved_article in zip(
                    section.articles, saved_section["articles"], strict=True
                ):
                    if "visibility" not in article.material.model_fields_set:
                        saved_article["material"].pop("visibility", None)
        legacy_fingerprint = digest({"operation": operation, "body": payload})
        fingerprint = legacy_fingerprint
        if isinstance(body, (AgentSetUpdate, AgentCourseUpdate, CardEdit)):
            # Пропуск cards сохраняет колоду, явный [] очищает. Старые ключи нужны для повторов.
            fingerprint = digest(
                {
                    "operation": operation,
                    "provided": body.model_dump(mode="json", exclude_unset=True),
                }
            )
        previous = await token_repo.previous_request(self.db, user.id, key)
        if previous is not None:
            if previous.fingerprint not in (fingerprint, legacy_fingerprint):
                raise ConflictError("Этот Idempotency-Key уже использован для другого запроса")
            return previous.response
        if count_agent_write:
            period, resets_at = week_period()
            await Entitlements(self.db).consume(
                user, "agent.writes_per_week", amount=1, period_key=period, resets_at=resets_at
            )
        result = (await action()).model_dump(mode="json")
        self.db.add(
            AgentRequest(user_id=user.id, key=key, fingerprint=fingerprint, response=result)
        )
        await self.db.flush()
        return result

    async def set_detail(self, user: User, set_id: UUID) -> AgentSetDetail:
        study_set = await self.content.get_owned_set(user, set_id, with_cards=True)
        data = (
            SetDetail.model_validate(study_set)
            .model_copy(update={"can_edit": True})
            .model_dump(mode="json")
        )
        return AgentSetDetail(**data, revision=digest(data))

    async def list_folders(self, user: User) -> list[AgentFolderDetail]:
        return [self._folder_detail(folder) for folder in await self.content.list_folders(user)]

    async def folder_detail(self, user: User, folder_id: UUID) -> AgentFolderDetail:
        return self._folder_detail(await self.content.get_owned_folder(user, folder_id))

    def _folder_detail(self, folder: Folder) -> AgentFolderDetail:
        data = FolderPublic.model_validate(folder).model_dump(mode="json")
        return AgentFolderDetail(**data, revision=digest(data))

    async def create_folder(self, user: User, body: AgentFolderCreate) -> AgentFolderDetail:
        folder = await self.content.create_folder(user, FolderCreate(**body.model_dump()))
        return self._folder_detail(folder)

    async def update_folder(
        self, user: User, folder_id: UUID, body: AgentFolderUpdate
    ) -> AgentFolderDetail:
        current = await self.folder_detail(user, folder_id)
        if current.revision != body.revision:
            raise ConflictError(
                "Папка изменилась. Прочитайте её заново", details={"reason": "stale_revision"}
            )
        folder = await self.content.update_folder(
            user, folder_id, FolderUpdate(**body.model_dump(exclude={"revision"}))
        )
        return self._folder_detail(folder)

    async def delete_folder(self, user: User, folder_id: UUID, revision: str) -> AgentFolderDetail:
        current = await self.folder_detail(user, folder_id)
        if current.revision != revision:
            raise ConflictError(
                "Папка изменилась. Прочитайте её заново", details={"reason": "stale_revision"}
            )
        await self.content.delete_folder(user, folder_id)
        return current

    async def create_set(self, user: User, body: AgentSetWrite) -> AgentSetDetail:
        if any(card.id for card in body.cards):
            raise ConflictError("У новых карточек не должно быть id")
        study_set = await self.content.create_set(
            user, SetCreate(**body.model_dump(exclude={"cards"}))
        )
        await self.content.sync_cards(user, study_set.id, CardBatch(cards=body.cards))
        return await self.set_detail(user, study_set.id)

    async def update_set(self, user: User, set_id: UUID, body: AgentSetUpdate) -> AgentSetDetail:
        current = await self.set_detail(user, set_id)
        if current.revision != body.revision:
            raise ConflictError(
                "Набор изменился. Прочитайте его заново", details={"reason": "stale_revision"}
            )
        await self._write_set(user, set_id, body)
        return await self.set_detail(user, set_id)

    async def card_page(
        self, user: User, set_id: UUID, offset: int, limit: int, query: str
    ) -> CardPage:
        current = await self.set_detail(user, set_id)
        term = query.strip().casefold()
        matches = [
            c for c in current.cards if term in c.term.casefold() or term in c.definition.casefold()
        ]
        return CardPage(
            revision=current.revision, total=len(matches), cards=matches[offset : offset + limit]
        )

    async def edit_set_part(
        self,
        user: User,
        set_id: UUID,
        body: SetMove | CardAppend | CardEdit,
        card_id: UUID | None = None,
    ) -> SetEditResult:
        current = await self.set_detail(user, set_id)
        if current.revision != body.revision:
            raise ConflictError(
                "Набор изменился. Прочитайте его заново", details={"reason": "stale_revision"}
            )
        saved_ids: list[UUID] = []
        if isinstance(body, SetMove):
            await self.content.update_set(
                user, set_id, SetUpdate(title=current.title, folder_id=body.folder_id)
            )
        else:
            study_set = await self.content.get_owned_set(user, set_id, with_cards=True)
            if isinstance(body, CardAppend):
                if len(study_set.cards) + len(body.cards) > 5000:
                    raise ValidationError("В наборе может быть до 5000 карточек")
                position = max((c.position for c in study_set.cards), default=-1) + 1
                for index, item in enumerate(body.cards):
                    if item.id is not None:
                        raise ValidationError("У новой карточки не должно быть id")
                    card = Card(id=uuid4(), set_id=set_id, position=position + index)
                    await self.content.write_card(user, card, item)
                    self.db.add(card)
                    saved_ids.append(card.id)
                study_set.cards_count += len(body.cards)
            else:
                existing = next((c for c in study_set.cards if c.id == card_id), None)
                if existing is None:
                    raise NotFoundError("Карточка не найдена в этом наборе")
                values = {field: getattr(existing, field) for field in AgentCardWrite.model_fields}
                try:
                    merged = AgentCardWrite.model_validate(
                        values | body.changes.model_dump(exclude_unset=True)
                    )
                except SchemaError as error:
                    raise ValidationError(
                        "Проверьте изменённые поля карточки",
                        details={
                            "errors": [{"loc": e["loc"], "type": e["type"]} for e in error.errors()]
                        },
                    ) from error
                await self.content.write_card(user, existing, merged)
                saved_ids.append(existing.id)
            study_set.updated_at = datetime.now(UTC)
            await self.db.flush()
            course = await course_repo.course_for_set(self.db, set_id)
            if course is not None:
                await queue_course(self.db, course.id)
        saved = await self.set_detail(user, set_id)
        return SetEditResult(
            set_id=set_id,
            revision=saved.revision,
            folder_id=saved.folder_id,
            cards_count=saved.cards_count,
            card_ids=saved_ids,
        )

    async def _write_set(self, user: User, set_id: UUID, body: AgentSetWrite) -> None:
        await self.content.update_set(
            user,
            set_id,
            SetUpdate(**body.model_dump(exclude={"cards", "revision"}, exclude_unset=True)),
        )
        if "cards" in body.model_fields_set:
            await self.content.sync_cards(user, set_id, CardBatch(cards=body.cards))

    async def course_detail(self, user: User, course_id: UUID) -> AgentCourseDetail:
        course = await self.courses.owned(user, course_id)
        articles = await course_repo.articles(self.db, course_id)
        sections = []
        for section in await course_repo.sections(self.db, course_id):
            sections.append(
                AgentSectionDetail(
                    id=section.id,
                    title=section.title,
                    position=section.position,
                    articles=[
                        AgentArticleDetail(
                            id=a.id,
                            title=a.title,
                            body=a.body,
                            position=a.position,
                            material=await self.set_detail(user, a.set_id),
                        )
                        for a in articles
                        if a.section_id == section.id
                    ],
                )
            )
        data = {
            **CourseSummary.model_validate(course).model_dump(mode="json"),
            "sections": [s.model_dump(mode="json") for s in sections],
        }
        return AgentCourseDetail(**data, revision=digest(data))

    async def create_course(self, user: User, body: AgentCourseCreate) -> AgentCourseDetail:
        await Entitlements(self.db).check_course_creation(user)
        if not body.is_published:
            await Entitlements(self.db).require_feature(user, "materials.private")
        course_id = uuid4()
        course = Course(
            id=course_id,
            is_published=body.is_published,
            published_at=datetime.now(UTC) if body.is_published else None,
            owner_id=user.id,
            title=body.title,
            description=body.description,
            slug=f"course-{course_id}",
        )
        self.db.add(course)
        await self.db.flush()
        await self._write_structure(user, course, body)
        return await self.course_detail(user, course_id)

    async def update_course(
        self, user: User, course_id: UUID, body: AgentCourseUpdate
    ) -> AgentCourseDetail:
        current = await self.course_detail(user, course_id)
        if current.revision != body.revision:
            raise ConflictError(
                "Курс изменился. Прочитайте его заново", details={"reason": "stale_revision"}
            )
        course = await self.courses.owned(user, course_id)
        await self._write_structure(user, course, body)
        return await self.course_detail(user, course_id)

    async def _write_structure(self, user: User, course: Course, body: AgentCourseWrite) -> None:
        await self.content.validate_media_owned(
            user,
            {
                asset_id
                for section in body.sections
                for article in section.articles
                for asset_id in extract_media_ids(article.body)
            },
        )
        sections = {s.id: s for s in await course_repo.sections(self.db, course.id)}
        articles = {a.id: a for a in await course_repo.articles(self.db, course.id)}
        section_ids = [s.id for s in body.sections if s.id]
        article_ids = [a.id for s in body.sections for a in s.articles if a.id]
        # Не удаляем пропущенную структуру: неполный ответ модели не должен терять материалы.
        if set(section_ids) != set(sections) or len(section_ids) != len(set(section_ids)):
            raise ConflictError("Передайте все существующие разделы ровно один раз")
        if set(article_ids) != set(articles) or len(article_ids) != len(set(article_ids)):
            raise ConflictError("Передайте все существующие статьи ровно один раз")
        for index, section in enumerate(sections.values(), 1):
            section.position = -index
        for index, article in enumerate(articles.values(), 1):
            article.position = -index
        await self.db.flush()
        course.title, course.description = body.title, body.description
        course.updated_at = datetime.now(UTC)
        for position, section_body in enumerate(body.sections):
            section = (
                sections[section_body.id]
                if section_body.id
                else CourseSection(
                    id=uuid4(), course_id=course.id, title=section_body.title, position=position
                )
            )
            self.db.add(section)
            section.title, section.position = section_body.title, position
            await self.db.flush()
            for article_position, article_body in enumerate(section_body.articles):
                if article_body.id:
                    article = articles[article_body.id]
                    await self._write_set(user, article.set_id, article_body.material)
                else:
                    spec = article_body.material
                    if course.is_published and spec.visibility != SetVisibility.public:
                        raise ConflictError("В публичном курсе набор должен быть открытым")
                    if not course.is_published and "visibility" not in spec.model_fields_set:
                        spec = spec.model_copy(update={"visibility": SetVisibility.private})
                    material = await self.create_set(user, spec)
                    article = CourseArticle(
                        id=uuid4(),
                        section_id=section.id,
                        set_id=material.id,
                        title=article_body.title,
                        position=article_position,
                    )
                    self.db.add(article)
                article.section_id = section.id
                from app.services.note_links import before_article_change

                await before_article_change(self.db, article, article_body.body)
                article.title, article.body = article_body.title, article_body.body
                article.position = article_position
                await self.db.flush()
        await self.db.refresh(course)
        await queue_course(self.db, course.id)
