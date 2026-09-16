"""Документы каталога формируются только из доступного публичного содержимого."""

from typing import Any
from uuid import UUID

from sqlalchemy import exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.content import Card, StudySet
from app.models.courses import Course, CourseArticle, CourseSection
from app.models.user import User, UserStatus


async def course_ids(db: AsyncSession, after: UUID | None, limit: int = 100) -> list[UUID]:
    query = select(Course.id).order_by(Course.id).limit(limit)
    if after is not None:
        query = query.where(Course.id > after)
    return list(await db.scalars(query))


async def course_documents(
    db: AsyncSession, ids: list[UUID], *, include_content: bool = True
) -> list[dict[str, Any]]:
    if not ids:
        return []
    invalid_material = (
        select(CourseArticle.id)
        .join(CourseSection)
        .join(StudySet)
        .where(
            CourseSection.course_id == Course.id,
            or_(StudySet.deleted_at.is_not(None), StudySet.owner_id != Course.owner_id),
        )
        .correlate(Course)
    )
    courses = (
        await db.execute(
            select(Course, func.coalesce(User.display_name, User.username))
            .join(User, User.id == Course.owner_id)
            .where(
                Course.id.in_(ids),
                Course.is_published.is_(True),
                Course.is_listed.is_(True),
                Course.moderation_status != "blocked",
                User.status == UserStatus.active,
                User.deleted_at.is_(None),
                ~exists(invalid_material),
            )
        )
    ).all()
    if not courses:
        return []
    allowed_ids = [course.id for course, _ in courses]
    materials = (
        await db.execute(
            select(CourseSection.course_id, CourseArticle, StudySet)
            .join(CourseArticle, CourseArticle.section_id == CourseSection.id)
            .join(StudySet, StudySet.id == CourseArticle.set_id)
            .where(CourseSection.course_id.in_(allowed_ids))
            .order_by(CourseSection.position, CourseArticle.position)
        )
    ).all()
    documents: dict[UUID, dict[str, Any]] = {}
    for course, author in courses:
        documents[course.id] = {
            "id": str(course.id),
            "slug": course.slug,
            "title": course.title,
            "description": course.description,
            "tags": course.tags,
            "author_id": str(course.owner_id),
            "author": author,
            "languages": [],
            "cards_count": 0,
            "updated_at": int(course.updated_at.timestamp()),
            "content": [],
        }
    set_courses: dict[UUID, UUID] = {}
    for course_id, article, study_set in materials:
        document = documents[course_id]
        set_courses[study_set.id] = course_id
        document["languages"] = sorted(
            set(document["languages"]) | {study_set.lang_term, study_set.lang_definition}
        )
        document["updated_at"] = max(
            document["updated_at"],
            int(study_set.updated_at.timestamp()),
            int(article.updated_at.timestamp()),
        )
        if include_content:
            document["content"].extend(
                [article.title, article.body, study_set.title, study_set.description]
            )
    if set_courses and not include_content:
        counts = await db.execute(
            select(Card.set_id, func.count(Card.id))
            .where(Card.set_id.in_(set_courses))
            .group_by(Card.set_id)
        )
        for set_id, count in counts:
            documents[set_courses[set_id]]["cards_count"] += count
    elif set_courses:
        cards = await db.stream(
            select(Card.set_id, Card.term, Card.definition, Card.hint)
            .where(Card.set_id.in_(set_courses))
            .order_by(Card.set_id, Card.position)
        )
        async for set_id, term, definition, hint in cards:
            document = documents[set_courses[set_id]]
            document["cards_count"] += 1
            document["content"].extend([term, definition, hint or ""])
    # Старые пустые публикации сохраняют прямые ссылки, но не засоряют каталог.
    return [document for document in documents.values() if document["cards_count"] > 0]
