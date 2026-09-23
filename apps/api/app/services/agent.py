"""Атомарные операции агента поверх общих сервисов контента и курсов."""

import hashlib
import json
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError
from app.models.api_tokens import AgentRequest
from app.models.courses import Course, CourseArticle, CourseSection
from app.models.user import User
from app.repositories import api_tokens as token_repo
from app.repositories import courses as course_repo
from app.schemas.agent import (
    AgentArticleDetail,
    AgentCourseDetail,
    AgentCourseUpdate,
    AgentCourseWrite,
    AgentSectionDetail,
    AgentSetDetail,
    AgentSetUpdate,
    AgentSetWrite,
)
from app.schemas.content import CardBatch, SetCreate, SetDetail, SetUpdate
from app.schemas.courses import CourseSummary
from app.services.content import ContentService
from app.services.courses import CourseService


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
    ) -> dict[str, Any]:
        await token_repo.lock_request(self.db, user.id)
        # None — операция без тела: отпечаток определяется одним `operation`.
        payload = body.model_dump(mode="json") if body is not None else {}
        fingerprint = digest({"operation": operation, "body": payload})
        previous = await token_repo.previous_request(self.db, user.id, key)
        if previous is not None:
            if previous.fingerprint != fingerprint:
                raise ConflictError("Этот Idempotency-Key уже использован для другого запроса")
            return previous.response
        result = (await action()).model_dump(mode="json")
        self.db.add(
            AgentRequest(user_id=user.id, key=key, fingerprint=fingerprint, response=result)
        )
        await self.db.flush()
        return result

    async def set_detail(self, user: User, set_id: UUID) -> AgentSetDetail:
        study_set = await self.content.get_owned_set(user, set_id, with_cards=True)
        data = SetDetail.model_validate(study_set).model_dump(mode="json")
        return AgentSetDetail(**data, revision=digest(data))

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

    async def _write_set(self, user: User, set_id: UUID, body: AgentSetWrite) -> None:
        study_set = await self.content.get_owned_set(user, set_id)
        course = await course_repo.course_for_set(self.db, set_id)
        if course and course.is_published:
            raise ConflictError("Перед изменением агентом снимите курс с публикации")
        await self.content.update_set(
            user,
            set_id,
            SetUpdate(
                title=body.title,
                description=body.description,
                lang_term=body.lang_term,
                lang_definition=body.lang_definition,
                folder_id=study_set.folder_id,
            ),
        )
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

    async def create_course(self, user: User, body: AgentCourseWrite) -> AgentCourseDetail:
        course_id = uuid4()
        course = Course(
            id=course_id,
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
        if course.is_published:
            raise ConflictError("Перед изменением агентом снимите курс с публикации")
        await self._write_structure(user, course, body)
        return await self.course_detail(user, course_id)

    async def _write_structure(self, user: User, course: Course, body: AgentCourseWrite) -> None:
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
                    material = await self.create_set(user, article_body.material)
                    article = CourseArticle(
                        id=uuid4(),
                        section_id=section.id,
                        set_id=material.id,
                        title=article_body.title,
                        position=article_position,
                    )
                    self.db.add(article)
                article.section_id = section.id
                article.title, article.body = article_body.title, article_body.body
                article.position = article_position
                await self.db.flush()
        await self.db.refresh(course)
