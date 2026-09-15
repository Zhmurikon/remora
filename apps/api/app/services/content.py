"""Бизнес-логика наборов и атомарного сохранения карточек."""

import re
from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import ConflictError, ForbiddenError, NotFoundError
from app.core.storage import get_object_storage
from app.models.content import Card, ContentType, Folder, MediaAsset, MediaStatus, StudySet
from app.models.user import User
from app.repositories import content as content_repo
from app.schemas.content import (
    CardBatch,
    FolderCreate,
    FolderUpdate,
    PublicCard,
    PublicSet,
    PublicSetAuthor,
    SetCreate,
    SetUpdate,
)

_HTML_TAG = re.compile(r"<\s*/?\s*[a-zA-Z][^>]*>")


class ContentService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def list_sets(self, user: User) -> list[StudySet]:
        return await content_repo.list_sets(self.db, user.id)

    async def get_public_set(self, slug: str) -> PublicSet:
        result = await content_repo.get_public_set_by_slug(self.db, slug)
        if result is None:
            raise NotFoundError("Набор не найден")
        study_set, author = result
        visible_cards = study_set.cards[:50]
        asset_ids = {
            asset_id
            for card in visible_cards
            for asset_id in (card.term_image_id, card.definition_image_id)
            if asset_id is not None
        }
        assets = {
            asset.id: asset
            for asset in await content_repo.get_media_assets(self.db, asset_ids)
            if asset.status == MediaStatus.ready and asset.owner_id == study_set.owner_id
        }
        return PublicSet(
            id=study_set.id,
            title=study_set.title,
            description=study_set.description,
            visibility=study_set.visibility,
            slug=study_set.slug,
            cards_count=study_set.cards_count,
            lang_term=study_set.lang_term,
            lang_definition=study_set.lang_definition,
            author=PublicSetAuthor(
                username=author.username,
                display_name=author.display_name,
                avatar_url=author.avatar_url,
            ),
            cards=[self._public_card(card, assets) for card in visible_cards],
            created_at=study_set.created_at,
            updated_at=study_set.updated_at,
        )

    async def list_folders(self, user: User) -> list[Folder]:
        return await content_repo.list_folders(self.db, user.id)

    async def get_owned_folder(self, user: User, folder_id: UUID) -> Folder:
        folder = await content_repo.get_folder(self.db, folder_id)
        if folder is None:
            raise NotFoundError("Папка не найдена")
        if folder.owner_id != user.id:
            raise ForbiddenError("Нет доступа к этой папке")
        return folder

    async def create_folder(self, user: User, body: FolderCreate) -> Folder:
        if body.parent_id is not None:
            await self.get_owned_folder(user, body.parent_id)
        folder = Folder(
            owner_id=user.id,
            position=await content_repo.next_folder_position(self.db, user.id),
            **body.model_dump(),
        )
        self.db.add(folder)
        await self.db.flush()
        return folder

    async def update_folder(self, user: User, folder_id: UUID, body: FolderUpdate) -> Folder:
        folder = await self.get_owned_folder(user, folder_id)
        values = body.model_dump(exclude_unset=True)
        parent_id = values.get("parent_id")
        if parent_id == folder.id:
            raise ConflictError("Папка не может находиться внутри себя")
        if parent_id is not None:
            parent: Folder | None = await self.get_owned_folder(user, parent_id)
            visited = {folder.id}
            while parent is not None:
                if parent.id in visited:
                    raise ConflictError("Нельзя создать цикл из вложенных папок")
                visited.add(parent.id)
                parent = (
                    await self.get_owned_folder(user, parent.parent_id)
                    if parent.parent_id is not None
                    else None
                )
        for field, value in values.items():
            setattr(folder, field, value)
        await self.db.flush()
        return folder

    async def delete_folder(self, user: User, folder_id: UUID) -> None:
        await content_repo.delete_folder(self.db, await self.get_owned_folder(user, folder_id))

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
        if body.folder_id is not None:
            await self.get_owned_folder(user, body.folder_id)
        study_set = StudySet(id=uuid4(), owner_id=user.id, slug="pending", **body.model_dump())
        study_set.slug = f"{_slug(body.title)}-{str(study_set.id)[:8]}"
        return await content_repo.create_set(self.db, study_set)

    async def update_set(self, user: User, set_id: UUID, body: SetUpdate) -> StudySet:
        if body.folder_id is not None:
            await self.get_owned_folder(user, body.folder_id)
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
                folder_id=source.folder_id,
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
                    term_image_id=source_card.term_image_id,
                    definition_image_id=source_card.definition_image_id,
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
            if item.content_type != ContentType.code:
                _validate_plain_content(item.term, item.definition)
            if item.content_type == ContentType.code and not item.code_language:
                raise ConflictError("Для блока кода нужно выбрать язык")
            await self._validate_images(user, item.term_image_id, item.definition_image_id)
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

    async def _validate_images(self, user: User, *image_ids: UUID | None) -> None:
        for image_id in {value for value in image_ids if value is not None}:
            asset = await content_repo.get_media_asset(self.db, image_id)
            if asset is None or asset.owner_id != user.id or asset.status != MediaStatus.ready:
                raise ConflictError("Изображение недоступно или ещё не обработано")

    @staticmethod
    def _public_card(card: Card, assets: dict[UUID, MediaAsset]) -> PublicCard:
        storage = get_object_storage()
        ttl = get_settings().media_download_ttl_seconds

        def image_url(asset_id: UUID | None) -> str | None:
            asset = assets.get(asset_id) if asset_id is not None else None
            return storage.download_url(asset.s3_key, ttl) if asset is not None else None

        return PublicCard(
            id=card.id,
            position=card.position,
            term=card.term,
            definition=card.definition,
            term_transcription=card.term_transcription,
            definition_transcription=card.definition_transcription,
            hint=card.hint,
            content_type=card.content_type,
            code_language=card.code_language,
            term_image_url=image_url(card.term_image_id),
            definition_image_url=image_url(card.definition_image_id),
        )


def _slug(value: str) -> str:
    slug = re.sub(r"[^a-z0-9а-яё]+", "-", value.lower()).strip("-")
    return slug[:120] or "nabor"


def _validate_plain_content(*values: str) -> None:
    if any(_HTML_TAG.search(value) for value in values):
        raise ConflictError("HTML-разметка в карточках не поддерживается")
