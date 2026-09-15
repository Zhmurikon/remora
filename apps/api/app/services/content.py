"""Бизнес-логика наборов и атомарного сохранения карточек."""

import re
from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, ForbiddenError, NotFoundError
from app.models.content import Card, StudySet
from app.models.user import User
from app.repositories import content as content_repo
from app.schemas.content import CardBatch, SetCreate, SetUpdate

_HTML_TAG = re.compile(r"<\s*/?\s*[a-zA-Z][^>]*>")


class ContentService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def list_sets(self, user: User) -> list[StudySet]:
        return await content_repo.list_sets(self.db, user.id)

    async def get_owned_set(
        self, user: User, set_id: UUID, *, with_cards: bool = False
    ) -> StudySet:
        study_set = await content_repo.get_set(self.db, set_id, with_cards=with_cards)
        if study_set is None:
            raise NotFoundError("Набор не найден")
        if study_set.owner_id != user.id:
            raise ForbiddenError("Нет доступа к этому набору")
        return study_set

    async def create_set(self, user: User, body: SetCreate) -> StudySet:
        study_set = StudySet(id=uuid4(), owner_id=user.id, slug="pending", **body.model_dump())
        study_set.slug = f"{_slug(body.title)}-{str(study_set.id)[:8]}"
        return await content_repo.create_set(self.db, study_set)

    async def update_set(self, user: User, set_id: UUID, body: SetUpdate) -> StudySet:
        study_set = await self.get_owned_set(user, set_id, with_cards=True)
        for field, value in body.model_dump().items():
            setattr(study_set, field, value)
        await self.db.flush()
        return study_set

    async def delete_set(self, user: User, set_id: UUID) -> None:
        await content_repo.soft_delete_set(self.db, await self.get_owned_set(user, set_id))

    async def duplicate_set(self, user: User, set_id: UUID) -> StudySet:
        source = await self.get_owned_set(user, set_id, with_cards=True)
        copy = await self.create_set(
            user,
            SetCreate(
                title=f"Копия — {source.title}",
                description=source.description,
                visibility=source.visibility,
                lang_term=source.lang_term,
                lang_definition=source.lang_definition,
            ),
        )
        copy.copied_from_id = source.id
        for source_card in source.cards:
            self.db.add(
                Card(
                    set_id=copy.id,
                    position=source_card.position,
                    term=source_card.term,
                    definition=source_card.definition,
                    term_transcription=source_card.term_transcription,
                    definition_transcription=source_card.definition_transcription,
                    hint=source_card.hint,
                    content_type=source_card.content_type,
                    code_language=source_card.code_language,
                    alt_answers=source_card.alt_answers,
                )
            )
        copy.cards_count = len(source.cards)
        await self.db.flush()
        return await self.get_owned_set(user, copy.id, with_cards=True)

    async def sync_cards(self, user: User, set_id: UUID, body: CardBatch) -> StudySet:
        study_set = await self.get_owned_set(user, set_id, with_cards=True)
        existing = {card.id: card for card in study_set.cards}
        for temporary_position, card in enumerate(existing.values(), start=1):
            card.position = -temporary_position
        await self.db.flush()
        seen: set[UUID] = set()
        result: list[Card] = []
        for position, item in enumerate(body.cards):
            _validate_plain_content(item.term, item.definition)
            if item.id is not None:
                existing_card = existing.get(item.id)
                if existing_card is None or item.id in seen:
                    raise ConflictError("Карточка не принадлежит набору или повторяется")
                seen.add(item.id)
                card = existing_card
            else:
                card = Card(set_id=study_set.id, position=position, term="", definition="")
                self.db.add(card)
            for field, value in item.model_dump(exclude={"id"}).items():
                setattr(card, field, value)
            card.position = position
            result.append(card)
        await content_repo.sync_cards(self.db, study_set, result)
        study_set.cards_count = len(result)
        await self.db.flush()
        return await self.get_owned_set(user, set_id, with_cards=True)


def _slug(value: str) -> str:
    slug = re.sub(r"[^a-z0-9а-яё]+", "-", value.lower()).strip("-")
    return slug[:120] or "nabor"


def _validate_plain_content(*values: str) -> None:
    if any(_HTML_TAG.search(value) for value in values):
        raise ConflictError("HTML-разметка в карточках не поддерживается")
