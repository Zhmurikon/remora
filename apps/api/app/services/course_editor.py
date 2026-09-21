"""Редактор структуры и независимые копии, без изменения учебного прогресса."""

from datetime import UTC, datetime
from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, NotFoundError
from app.core.storage import get_object_storage
from app.models.content import Card, MediaAsset, MediaStatus, SetVisibility, StudySet
from app.models.courses import Course, CourseArticle, CourseSection
from app.models.user import User
from app.repositories import content as content_repo
from app.repositories import courses as repo
from app.repositories.api_tokens import lock_request
from app.schemas.content import CardWrite, SetCreate, SetDetail
from app.schemas.courses import (
    CourseCopyRequest,
    CourseEditorDetail,
    CourseStructureWrite,
    SectionWrite,
)
from app.services.agent import AgentService, digest
from app.services.content import ContentService
from app.services.courses import CourseService


class CourseEditorService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.courses = CourseService(db)
        self.content = ContentService(db)

    async def detail(self, user: User, course_id: UUID) -> CourseEditorDetail:
        detail = await self.courses.detail(user, course_id)
        data = detail.model_dump(mode="json")
        return CourseEditorDetail(**data, revision=digest(data))

    async def save_agent_structure(
        self, user: User, course_id: UUID, body: CourseStructureWrite
    ) -> CourseEditorDetail:
        await lock_request(self.db, user.id)
        current = await self.detail(user, course_id)
        old_sections = {s.id for s in current.sections}
        old_articles = {a.id for s in current.sections for a in s.articles}
        if not old_sections <= {s.id for s in body.sections} or not old_articles <= {
            a.id for s in body.sections for a in s.articles
        }:
            raise ConflictError("Для удаления используйте отдельную операцию с подтверждением")
        return await self.save(user, course_id, body)

    async def remove_structure_item(
        self, user: User, course_id: UUID, target_id: UUID, revision: str, *, section: bool
    ) -> CourseEditorDetail:
        await lock_request(self.db, user.id)
        current = await self.detail(user, course_id)
        targets = (
            {s.id for s in current.sections}
            if section
            else {a.id for s in current.sections for a in s.articles}
        )
        if target_id not in targets:
            raise NotFoundError("Материал не найден в этом курсе")
        sections = [SectionWrite.model_validate(s.model_dump()) for s in current.sections]
        if section:
            sections = [s for s in sections if s.id != target_id]
        else:
            for entry in sections:
                entry.articles = [a for a in entry.articles if a.id != target_id]
        return await self.save(
            user, course_id, CourseStructureWrite(revision=revision, sections=sections)
        )

    async def save(
        self, user: User, course_id: UUID, body: CourseStructureWrite
    ) -> CourseEditorDetail:
        await lock_request(self.db, user.id)
        course = await self.courses.owned(user, course_id)
        current = await self.detail(user, course_id)
        if current.revision != body.revision:
            raise ConflictError(
                "Курс изменился в другой вкладке", details={"reason": "stale_revision"}
            )
        if course.is_published:
            raise ConflictError("Перед изменением структуры снимите курс с публикации")
        sections = {s.id: s for s in await repo.sections(self.db, course_id)}
        articles = {a.id: a for a in await repo.articles(self.db, course_id)}
        section_ids = [s.id for s in body.sections if s.id]
        article_ids = [a.id for s in body.sections for a in s.articles if a.id]
        if len(set(section_ids)) != len(section_ids) or not set(section_ids) <= sections.keys():
            raise ConflictError("Раздел повторяется или не принадлежит курсу")
        if len(set(article_ids)) != len(article_ids) or not set(article_ids) <= articles.keys():
            raise ConflictError("Статья повторяется или не принадлежит курсу")
        used_sets: set[UUID] = set()
        for section_input in body.sections:
            for article_input in section_input.articles:
                if article_input.id and article_input.set_id != articles[article_input.id].set_id:
                    raise ConflictError("Нельзя заменить набор существующей статьи")
                if article_input.set_id:
                    await self.content.get_owned_set(user, article_input.set_id)
                    linked = await repo.get_article_for_set(self.db, article_input.set_id)
                    if article_input.set_id in used_sets or (
                        linked and linked.id != article_input.id
                    ):
                        raise ConflictError("Набор уже связан со статьёй")
                    used_sets.add(article_input.set_id)
        # Отрицательные позиции исключают конфликт уникальности при перестановке.
        for index, section in enumerate(sections.values(), 1):
            section.position = -index
        for index, article in enumerate(articles.values(), 1):
            article.position = -index
        for article in articles.values():
            if article.id not in article_ids:
                material = await content_repo.get_set(self.db, article.set_id)
                if material:
                    material.visibility = SetVisibility.private
                await self.db.delete(article)
        await self.db.flush()
        for position, item in enumerate(body.sections):
            section = (
                sections[item.id]
                if item.id
                else CourseSection(
                    id=uuid4(), course_id=course_id, title=item.title, position=position
                )
            )
            section.title, section.position = item.title, position
            self.db.add(section)
            await self.db.flush()
            for article_position, entry in enumerate(item.articles):
                if entry.id:
                    article = articles[entry.id]
                else:
                    set_id = entry.set_id
                    if set_id is None:
                        material = await self.content.create_set(user, SetCreate(title=entry.title))
                        set_id = material.id
                    article = CourseArticle(
                        set_id=set_id,
                        section_id=section.id,
                        title=entry.title,
                        position=article_position,
                    )
                    self.db.add(article)
                article.section_id = section.id
                article.title, article.body = entry.title, entry.body
                article.position = article_position
                await self.db.flush()
        for section in sections.values():
            if section.id not in section_ids:
                await self.db.delete(section)
        course.updated_at = datetime.now(UTC)
        await self.db.flush()
        return await self.detail(user, course_id)

    async def _copy_set_content(
        self,
        user: User,
        material: StudySet,
        source_owner_id: UUID,
        media: dict[UUID, UUID],
        uploaded: list[str],
    ) -> StudySet:
        """Независимая копия набора: новые ID карточек и собственные копии изображений.

        Чужие `media_id` переиспользовать нельзя — подписанные ссылки проверяют владельца,
        а удаление оригинала оставило бы копию без картинок.
        """
        storage = get_object_storage()
        new_set = await self.content.create_set(
            user,
            SetCreate(
                title=material.title,
                description=material.description,
                lang_term=material.lang_term,
                lang_definition=material.lang_definition,
            ),
        )
        new_set.copied_from_id = material.id
        for card in material.cards:
            values = CardWrite.model_validate(card, from_attributes=True).model_dump(
                exclude={"id"}
            )
            for field in ("term_image_id", "definition_image_id"):
                asset_id = values[field]
                if asset_id is None:
                    continue
                if asset_id not in media:
                    asset = await content_repo.get_media_asset(self.db, asset_id)
                    if (
                        not asset
                        or asset.owner_id != source_owner_id
                        or asset.status != MediaStatus.ready
                    ):
                        raise ConflictError("Изображение материала недоступно")
                    new_id = uuid4()
                    key = f"{user.id}/copies/{new_id}"
                    payload, _ = await storage.read(asset.s3_key, asset.size_bytes)
                    uploaded.append(key)
                    await storage.put(key, payload, asset.mime)
                    self.db.add(
                        MediaAsset(
                            id=new_id,
                            owner_id=user.id,
                            s3_key=key,
                            kind=asset.kind,
                            mime=asset.mime,
                            size_bytes=asset.size_bytes,
                            width=asset.width,
                            height=asset.height,
                            checksum=asset.checksum,
                            source=asset.source,
                            status=MediaStatus.ready,
                        )
                    )
                    await self.db.flush()
                    media[asset_id] = new_id
                values[field] = media[asset_id]
            self.db.add(Card(set_id=new_set.id, position=card.position, **values))
        new_set.cards_count = len(material.cards)
        await self.db.flush()
        return new_set

    async def copy_set(self, user: User, set_id: UUID) -> SetDetail:
        """Копия набора из доступного публичного курса становится отдельным приватным набором."""
        material = await content_repo.get_set(self.db, set_id, with_cards=True)
        if material is None:
            raise NotFoundError("Набор не найден")
        source_owner_id = material.owner_id
        for owner_id in sorted({user.id, source_owner_id}, key=str):
            await lock_request(self.db, owner_id)
        if source_owner_id != user.id:
            material = await content_repo.accessible_public_set(self.db, set_id)
            if material is None:
                raise NotFoundError("Набор недоступен")
        uploaded: list[str] = []
        try:
            copied = await self._copy_set_content(user, material, source_owner_id, {}, uploaded)
        except Exception:
            storage = get_object_storage()
            for key in uploaded:
                await storage.delete(key)
            raise
        return SetDetail.model_validate(
            await self.content.get_owned_set(user, copied.id, with_cards=True)
        )

    async def copy_set_once(self, user: User, set_id: UUID, key: str) -> SetDetail:
        result = await AgentService(self.db).once(
            user, key, f"set-copy:{set_id}", None, lambda: self.copy_set(user, set_id)
        )
        return SetDetail.model_validate(result)

    async def copy(
        self, user: User, course_id: UUID, article_id: UUID | None
    ) -> CourseEditorDetail:
        source = await repo.get_course(self.db, course_id)
        if source is None:
            raise NotFoundError("Курс не найден")
        # Единый порядок блокировок предотвращает взаимную блокировку встречных копирований.
        for owner_id in sorted({user.id, source.owner_id}, key=str):
            await lock_request(self.db, owner_id)
        await self.db.refresh(source)
        if source.owner_id != user.id and await repo.public_course(self.db, source.slug) is None:
            raise NotFoundError("Курс недоступен")
        articles = await repo.articles(self.db, course_id)
        if article_id:
            articles = [a for a in articles if a.id == article_id]
            if not articles:
                raise NotFoundError("Статья не найдена")
        copied_id = uuid4()
        title = articles[0].title if article_id else source.title
        copied = Course(
            id=copied_id,
            owner_id=user.id,
            title=f"Копия — {title}"[:160],
            description=source.description,
            slug=f"course-{copied_id}",
            tags=list(source.tags),
        )
        self.db.add(copied)
        await self.db.flush()
        media: dict[UUID, UUID] = {}
        uploaded: list[str] = []
        storage = get_object_storage()
        try:
            for section in await repo.sections(self.db, course_id):
                selected = [a for a in articles if a.section_id == section.id]
                if article_id and not selected:
                    continue
                new_section = CourseSection(
                    id=uuid4(), course_id=copied_id, title=section.title, position=section.position
                )
                self.db.add(new_section)
                await self.db.flush()
                for article in selected:
                    material = await content_repo.get_set(self.db, article.set_id, with_cards=True)
                    if material is None or material.owner_id != source.owner_id:
                        raise ConflictError("Один из материалов недоступен")
                    new_set = await self._copy_set_content(
                        user, material, source.owner_id, media, uploaded
                    )
                    self.db.add(
                        CourseArticle(
                            section_id=new_section.id,
                            set_id=new_set.id,
                            title=article.title,
                            body=article.body,
                            position=article.position,
                        )
                    )
                    await self.db.flush()
            return await self.detail(user, copied_id)
        except Exception:
            for key in uploaded:
                await storage.delete(key)
            raise

    async def copy_once(
        self, user: User, course_id: UUID, body: CourseCopyRequest, key: str
    ) -> CourseEditorDetail:
        source = await repo.get_course(self.db, course_id)
        if source is None:
            raise NotFoundError("Курс не найден")
        for owner_id in sorted({user.id, source.owner_id}, key=str):
            await lock_request(self.db, owner_id)
        result = await AgentService(self.db).once(
            user,
            key,
            f"course-copy:{course_id}",
            body,
            lambda: self.copy(user, course_id, body.article_id),
        )
        return CourseEditorDetail.model_validate(result)
