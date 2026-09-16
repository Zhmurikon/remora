"""Создание личного курса из набора и управление его описанием."""

from datetime import UTC, datetime
from uuid import UUID, uuid4

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, ForbiddenError, NotFoundError
from app.models.courses import Course, CourseArticle, CourseSection
from app.models.user import User
from app.repositories import content as content_repo
from app.repositories import courses as repo
from app.schemas.content import PublicSet
from app.schemas.courses import (
    CourseArticlePublic,
    CourseCreate,
    CourseDetail,
    CourseMetadata,
    CoursePublication,
    CourseSectionPublic,
    CourseSummary,
)
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

    async def list_owned(self, user: User) -> list[CourseSummary]:
        return [CourseSummary.model_validate(c) for c in await repo.list_courses(self.db, user.id)]

    async def detail(self, user: User, course_id: UUID) -> CourseDetail:
        course = await self.owned(user, course_id)
        return await self._detail(course)

    async def _detail(self, course: Course) -> CourseDetail:
        articles = await repo.articles(self.db, course.id)
        sections = [
            CourseSectionPublic(
                id=section.id,
                title=section.title,
                position=section.position,
                articles=[
                    CourseArticlePublic.model_validate(a)
                    for a in articles
                    if a.section_id == section.id
                ],
            )
            for section in await repo.sections(self.db, course.id)
        ]
        return CourseDetail(**CourseSummary.model_validate(course).model_dump(), sections=sections)

    async def public_detail(self, slug: str) -> CourseDetail:
        course = await repo.public_course(self.db, slug)
        if course is None:
            raise NotFoundError("Курс не найден")
        return await self._detail(course)

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
        course.is_published = True
        course.published_at = course.published_at or datetime.now(UTC)
        course.tags = body.tags
        await self.db.flush()
        await self.db.refresh(course)
        return await self._detail(course)

    async def unpublish(self, user: User, course_id: UUID) -> CourseDetail:
        course = await self.owned(user, course_id)
        course.is_published = False
        await self.db.flush()
        await self.db.refresh(course)
        return await self._detail(course)

    async def create(self, user: User, body: CourseCreate) -> CourseDetail:
        study_set = await ContentService(self.db).get_owned_set(user, body.set_id)
        if await repo.get_article_for_set(self.db, body.set_id) is not None:
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
        course = await self.owned(user, course_id)
        course.title, course.description = body.title, body.description
        await self.db.flush()
        await self.db.refresh(course)
        return await self.detail(user, course_id)
