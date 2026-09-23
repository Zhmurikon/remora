"""Создание личного курса из набора и управление его описанием."""

from datetime import UTC, datetime
from uuid import UUID, uuid4

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.article_media import extract_media_ids
from app.core.config import get_settings
from app.core.errors import ConflictError, ForbiddenError, NotFoundError
from app.core.storage import get_object_storage
from app.models.content import MediaStatus, SetVisibility
from app.models.courses import Course, CourseArticle, CourseSection
from app.models.user import User
from app.repositories import content as content_repo
from app.repositories import courses as repo
from app.repositories.api_tokens import lock_request
from app.repositories.search import course_documents
from app.schemas.content import PublicSet, SetCreate
from app.schemas.courses import (
    ArticleMediaRef,
    CourseArticlePublic,
    CourseAuthor,
    CourseCreate,
    CourseDetail,
    CourseMetadata,
    CoursePublication,
    CourseSectionPublic,
    CourseSitemapEntry,
    CourseSummary,
)
from app.schemas.search import CourseSearchItem
from app.services.content import ContentService


class CourseService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def owned(self, user: User, course_id: UUID) -> Course:
        course = await repo.get_course(self.db, course_id)
        if course is None:
            raise NotFoundError("Курс не найден")
        if course.owner_id != user.id:
            raise ForbiddenError("Нет доступа к этому курсу")
        return course

    async def list_owned(
        self, user: User, *, offset: int = 0, limit: int | None = None
    ) -> list[CourseSummary]:
        return [
            CourseSummary.model_validate(c)
            for c in await repo.list_courses(self.db, user.id, offset=offset, limit=limit)
        ]

    async def detail(self, user: User, course_id: UUID) -> CourseDetail:
        course = await self.owned(user, course_id)
        return await self._detail(course)

    async def _resolve_article_media(
        self, articles: list[CourseArticle], owner_id: UUID
    ) -> dict[UUID, list[ArticleMediaRef]]:
        """Подписанные ссылки на изображения теории. Доступ, как у карточек: изображение
        должно принадлежать автору курса и быть готовым — иначе оно просто не отдаётся."""
        per_article = {article.id: extract_media_ids(article.body) for article in articles}
        wanted = {media_id for ids in per_article.values() for media_id in ids}
        assets = {
            asset.id: asset
            for asset in await content_repo.get_media_assets(self.db, wanted)
            if asset.status == MediaStatus.ready and asset.owner_id == owner_id
        }
        storage = get_object_storage()
        ttl = get_settings().media_download_ttl_seconds
        resolved: dict[UUID, list[ArticleMediaRef]] = {}
        for article_id, ids in per_article.items():
            resolved[article_id] = [
                ArticleMediaRef(
                    id=asset.id,
                    url=storage.download_url(asset.s3_key, ttl),
                    width=asset.width,
                    height=asset.height,
                )
                for media_id in ids
                if (asset := assets.get(media_id)) is not None
            ]
        return resolved

    async def _detail(self, course: Course, viewer: User | None = None) -> CourseDetail:
        author = await self.db.get(User, course.owner_id)
        if author is None:
            raise NotFoundError("Автор не найден")
        articles = await repo.articles(self.db, course.id)
        media = await self._resolve_article_media(articles, course.owner_id)
        sections = [
            CourseSectionPublic(
                id=section.id,
                title=section.title,
                position=section.position,
                articles=[
                    CourseArticlePublic.model_validate(a).model_copy(
                        update={"media": media.get(a.id, [])}
                    )
                    for a in articles
                    if a.section_id == section.id
                ],
            )
            for section in await repo.sections(self.db, course.id)
        ]
        summary = CourseSummary.model_validate(course).model_copy(
            update={
                "likes_count": await repo.likes_count(self.db, course.id),
                "saves_count": await repo.saves_count(self.db, course.id),
                "liked_by_me": bool(viewer and await repo.is_liked(self.db, course.id, viewer.id)),
            }
        )
        return CourseDetail(
            **summary.model_dump(),
            author=CourseAuthor(
                id=author.id,
                username=author.username,
                display_name=author.display_name,
                avatar_url=author.avatar_url,
            ),
            sections=sections,
        )

    async def public_detail(self, slug: str, viewer: User | None = None) -> CourseDetail:
        course = await repo.public_course(self.db, slug)
        if course is None:
            raise NotFoundError("Курс не найден")
        return await self._detail(course, viewer)

    async def sitemap(self) -> list[CourseSitemapEntry]:
        return [
            CourseSitemapEntry(slug=slug, author_username=username, updated_at=updated_at)
            for slug, username, updated_at in await repo.sitemap_entries(self.db)
        ]

    async def related(self, slug: str, limit: int) -> list[CourseSearchItem]:
        course = await repo.public_course(self.db, slug)
        if course is None:
            raise NotFoundError("Курс не найден")
        documents = await course_documents(
            self.db, await repo.related_course_ids(self.db, course), include_content=False
        )
        documents.sort(
            key=lambda item: (
                -len(set(course.tags) & set(item["tags"])),
                -item["saves_count"],
                -item["updated_at"],
            )
        )
        return [CourseSearchItem.model_validate(item) for item in documents[:limit]]

    async def like(self, user: User, slug: str) -> CourseDetail:
        await lock_request(self.db, user.id)
        course = await repo.public_course(self.db, slug)
        if course is None:
            raise NotFoundError("Курс не найден")
        await repo.add_like(self.db, course.id, user.id)
        return await self._detail(course, user)

    async def unlike(self, user: User, slug: str) -> CourseDetail:
        await lock_request(self.db, user.id)
        course = await repo.public_course(self.db, slug)
        if course is None:
            raise NotFoundError("Курс не найден")
        await repo.remove_like(self.db, course.id, user.id)
        return await self._detail(course, user)

    async def public_article(
        self,
        slug: str,
        article_id: UUID,
        *,
        after: int | None = None,
        revision: datetime | None = None,
    ) -> PublicSet:
        course = await repo.public_course(self.db, slug)
        if course is None:
            raise NotFoundError("Курс не найден")
        article = next(
            (a for a in await repo.articles(self.db, course.id) if a.id == article_id), None
        )
        if article is None:
            raise NotFoundError("Статья не найдена")
        study_set = await content_repo.get_set(self.db, article.set_id)
        if study_set is None or study_set.owner_id != course.owner_id:
            raise NotFoundError("Материал недоступен")
        return await ContentService(self.db).get_public_set(
            study_set.slug, after=after, revision=revision
        )

    async def publish(self, user: User, course_id: UUID, body: CoursePublication) -> CourseDetail:
        await lock_request(self.db, user.id)
        course = await self.owned(user, course_id)
        if course.moderation_status == "blocked":
            raise ForbiddenError("Курс заблокирован модератором")
        articles = await repo.articles(self.db, course_id)
        if not articles:
            raise ConflictError("Добавьте в курс набор карточек")
        for article in articles:
            study_set = await content_repo.get_set(self.db, article.set_id, with_cards=True)
            if study_set is None or study_set.owner_id != user.id or not study_set.cards:
                raise ConflictError("Каждая статья должна содержать доступный набор с карточками")
            study_set.visibility = SetVisibility.public
        await ContentService(self.db).validate_media_owned(
            user, {media_id for article in articles for media_id in extract_media_ids(article.body)}
        )
        course.is_published = True
        course.published_at = course.published_at or datetime.now(UTC)
        course.tags = body.tags
        await self.db.flush()
        await self.db.refresh(course)
        return await self._detail(course)

    async def unpublish(self, user: User, course_id: UUID) -> CourseDetail:
        await lock_request(self.db, user.id)
        course = await self.owned(user, course_id)
        course.is_published = False
        await self.db.flush()
        await self.db.refresh(course)
        return await self._detail(course)

    async def create(self, user: User, body: CourseCreate) -> CourseDetail:
        await lock_request(self.db, user.id)
        content = ContentService(self.db)
        study_set = (
            await content.get_owned_set(user, body.set_id)
            if body.set_id
            else await content.create_set(user, SetCreate(title=body.title))
        )
        if await repo.get_article_for_set(self.db, study_set.id) is not None:
            raise ConflictError("Набор уже связан со статьёй курса")
        course_id, section_id = uuid4(), uuid4()
        try:
            async with self.db.begin_nested():
                self.db.add(
                    Course(
                        id=course_id,
                        owner_id=user.id,
                        title=body.title,
                        description=body.description,
                        slug=f"course-{course_id}",
                    )
                )
                await self.db.flush()
                self.db.add(
                    CourseSection(
                        id=section_id,
                        course_id=course_id,
                        title="Основной раздел",
                        position=0,
                    )
                )
                await self.db.flush()
                self.db.add(
                    CourseArticle(
                        section_id=section_id,
                        set_id=study_set.id,
                        title=study_set.title,
                        body="",
                        position=0,
                    )
                )
                await self.db.flush()
        except IntegrityError as exc:
            # Уникальность защищает и от двух одновременных запросов создания курса.
            raise ConflictError("Не удалось связать набор с курсом") from exc
        return await self.detail(user, course_id)

    async def update(self, user: User, course_id: UUID, body: CourseMetadata) -> CourseDetail:
        await lock_request(self.db, user.id)
        course = await self.owned(user, course_id)
        course.title, course.description = body.title, body.description
        await self.db.flush()
        await self.db.refresh(course)
        return await self.detail(user, course_id)
