"""Связанная библиотека: сохранение оригинала и доступ к его обучению."""

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, NotFoundError
from app.models.content import StudySet
from app.models.courses import Course, CourseArticle, CourseSection, LibrarySave
from app.models.user import User
from app.repositories import content as content_repo
from app.repositories import courses as course_repo
from app.repositories import library as repo
from app.repositories.api_tokens import lock_request
from app.schemas.library import LibraryDiff, LibraryItem, LibrarySaveCreate, LibraryState


class LibraryService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def save(self, user: User, body: LibrarySaveCreate) -> LibraryItem:
        await lock_request(self.db, user.id)
        existing = await repo.save_for_target(self.db, user.id, body.target_type, body.target_id)
        if existing is not None:
            return await self._item(existing)
        course, article, study_set = await self._resolve(body.target_type, body.target_id)
        if course.owner_id == user.id:
            raise ConflictError("Собственный материал уже доступен в библиотеке")
        saved = LibrarySave(user_id=user.id)
        setattr(saved, f"{body.target_type}_id", body.target_id)
        saved.accepted_snapshot = await self._snapshot(
            body.target_type, course, article, study_set
        )
        self.db.add(saved)
        await self.db.flush()
        return await self._item(saved, course=course, article=article, study_set=study_set)

    async def remove(self, user: User, save_id: UUID) -> None:
        if not await repo.remove_save(self.db, user.id, save_id):
            raise NotFoundError("Сохранение не найдено")

    async def list(self, user: User) -> list[LibraryItem]:
        result: list[LibraryItem] = []
        for saved in await repo.list_saves(self.db, user.id):
            try:
                result.append(await self._item(saved))
            except NotFoundError:
                continue
        return result

    async def state(self, user: User, slug: str) -> LibraryState:
        course = await course_repo.public_course(self.db, slug)
        if course is None:
            raise NotFoundError("Курс не найден")
        saves = await repo.list_saves(self.db, user.id)
        article_ids = {a.id for a in await course_repo.articles(self.db, course.id)}
        set_ids = {a.set_id for a in await course_repo.articles(self.db, course.id)}
        return LibraryState(
            course_saved=any(s.course_id == course.id for s in saves),
            saved_article_ids=[s.article_id for s in saves if s.article_id in article_ids],
            saved_set_ids=[s.set_id for s in saves if s.set_id in set_ids],
        )

    async def diff(self, user: User, save_id: UUID) -> LibraryDiff:
        saved = await repo.get_save(self.db, user.id, save_id)
        if saved is None:
            raise NotFoundError("Сохранение не найдено")
        current = await self._current_snapshot(saved)
        return self._diff(saved, current)

    async def accept_update(self, user: User, save_id: UUID) -> LibraryItem:
        await lock_request(self.db, user.id)
        saved = await repo.get_save(self.db, user.id, save_id)
        if saved is None:
            raise NotFoundError("Сохранение не найдено")
        saved.accepted_snapshot = await self._current_snapshot(saved)
        saved.accepted_at = datetime.now(UTC)
        await self.db.flush()
        await self.db.refresh(saved, attribute_names=["updated_at"])
        return await self._item(saved)

    async def _resolve(
        self, target_type: str, target_id: UUID
    ) -> tuple[Course, CourseArticle | None, StudySet | None]:
        if target_type == "course":
            course = await course_repo.get_course(self.db, target_id)
            article = None
            study_set = None
        elif target_type == "article":
            article = await self.db.get(CourseArticle, target_id)
            section = await self.db.get(CourseSection, article.section_id) if article else None
            course = await course_repo.get_course(self.db, section.course_id) if section else None
            study_set = await content_repo.get_set(self.db, article.set_id) if article else None
        else:
            study_set = await content_repo.get_set(self.db, target_id)
            article = await course_repo.get_article_for_set(self.db, target_id)
            section = await self.db.get(CourseSection, article.section_id) if article else None
            course = await course_repo.get_course(self.db, section.course_id) if section else None
        if course is None or await course_repo.public_course(self.db, course.slug) is None:
            raise NotFoundError("Публичный материал не найден")
        return course, article, study_set

    async def _item(
        self,
        saved: LibrarySave,
        *,
        course: Course | None = None,
        article: CourseArticle | None = None,
        study_set: StudySet | None = None,
    ) -> LibraryItem:
        target_type = "course" if saved.course_id else "article" if saved.article_id else "set"
        target_id = saved.course_id or saved.article_id or saved.set_id
        assert target_id is not None
        if course is None:
            course, article, study_set = await self._resolve(target_type, target_id)
        if not saved.accepted_snapshot:
            saved.accepted_snapshot = await self._snapshot(
                target_type, course, article, study_set
            )
            saved.accepted_at = saved.created_at
            await self.db.flush()
        if article is None and target_type == "course":
            articles = await course_repo.articles(self.db, course.id)
        else:
            articles = [article] if article else []
        if study_set is None and article is not None:
            study_set = await content_repo.get_set(self.db, article.set_id)
        cards_count = study_set.cards_count if study_set else 0
        if study_set is None:
            for current_article in articles:
                current_set = await content_repo.get_set(self.db, current_article.set_id)
                if current_set is not None:
                    cards_count += current_set.cards_count
        return LibraryItem(
            id=saved.id,
            target_type=target_type,
            target_id=target_id,
            course_id=course.id,
            course_slug=course.slug,
            course_title=course.title,
            article_id=article.id if article else None,
            article_title=article.title if article else None,
            set_id=study_set.id if study_set else None,
            set_title=study_set.title if study_set else None,
            cards_count=cards_count,
            saved_at=saved.created_at,
            accepted_at=saved.accepted_at,
            has_updates=(await self._current_snapshot(saved)) != saved.accepted_snapshot,
        )

    async def _current_snapshot(self, saved: LibrarySave) -> dict[str, Any]:
        target_type = "course" if saved.course_id else "article" if saved.article_id else "set"
        target_id = saved.course_id or saved.article_id or saved.set_id
        assert target_id is not None
        course, article, study_set = await self._resolve(target_type, target_id)
        return await self._snapshot(target_type, course, article, study_set)

    async def _snapshot(
        self,
        target_type: str,
        course: Course,
        article: CourseArticle | None,
        study_set: StudySet | None,
    ) -> dict[str, Any]:
        articles = (
            await course_repo.articles(self.db, course.id)
            if target_type == "course"
            else ([article] if article else [])
        )
        result: list[dict[str, Any]] = []
        for current_article in articles:
            material = await content_repo.get_set(
                self.db, current_article.set_id, with_cards=True
            )
            if material is None:
                continue
            result.append(
                {
                    "id": str(current_article.id),
                    "title": current_article.title,
                    "body": current_article.body,
                    "set": {
                        "id": str(material.id),
                        "title": material.title,
                        "description": material.description,
                        "lang_term": material.lang_term,
                        "lang_definition": material.lang_definition,
                        "cards": [
                            {
                                "id": str(card.id),
                                "position": card.position,
                                "term": card.term,
                                "definition": card.definition,
                                "term_transcription": card.term_transcription,
                                "definition_transcription": card.definition_transcription,
                                "hint": card.hint,
                                "content_type": card.content_type.value,
                                "code_language": card.code_language,
                                "alt_answers": card.alt_answers,
                                "wrong_term_answers": card.wrong_term_answers,
                                "wrong_definition_answers": card.wrong_definition_answers,
                            }
                            for card in material.cards
                        ],
                    },
                }
            )
        return {
            "target_type": target_type,
            "course": {
                "id": str(course.id),
                "title": course.title,
                "description": course.description,
            },
            "articles": result,
        }

    @staticmethod
    def _diff(saved: LibrarySave, current: dict[str, Any]) -> LibraryDiff:
        old_articles = {a["id"]: a for a in saved.accepted_snapshot.get("articles", [])}
        new_articles = {a["id"]: a for a in current.get("articles", [])}
        common = old_articles.keys() & new_articles.keys()
        added = len(new_articles.keys() - old_articles.keys())
        removed = len(old_articles.keys() - new_articles.keys())
        articles_changed = sum(
            old_articles[key]["title"] != new_articles[key]["title"]
            or old_articles[key]["body"] != new_articles[key]["body"]
            for key in common
        )
        cards_added = cards_removed = cards_changed = 0
        for key in common:
            old_cards = {c["id"]: c for c in old_articles[key]["set"]["cards"]}
            new_cards = {c["id"]: c for c in new_articles[key]["set"]["cards"]}
            cards_added += len(new_cards.keys() - old_cards.keys())
            cards_removed += len(old_cards.keys() - new_cards.keys())
            common_cards = old_cards.keys() & new_cards.keys()
            cards_changed += sum(old_cards[cid] != new_cards[cid] for cid in common_cards)
        summary: list[str] = []
        for count, label in (
            (added, "Добавлено статей"),
            (removed, "Удалено статей"),
            (articles_changed, "Изменено статей"),
            (cards_added, "Добавлено карточек"),
            (cards_removed, "Удалено карточек"),
            (cards_changed, "Изменено карточек"),
        ):
            if count:
                summary.append(f"{label}: {count}")
        if saved.accepted_snapshot.get("course") != current.get("course"):
            summary.insert(0, "Изменены название или описание курса")
        return LibraryDiff(
            save_id=saved.id,
            has_updates=bool(summary),
            accepted_at=saved.accepted_at,
            summary=summary,
            articles_added=added,
            articles_removed=removed,
            articles_changed=articles_changed,
            cards_added=cards_added,
            cards_removed=cards_removed,
            cards_changed=cards_changed,
        )
