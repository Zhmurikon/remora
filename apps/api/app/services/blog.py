from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.article_media import extract_media_ids
from app.core.config import get_settings
from app.core.errors import ConflictError, ForbiddenError, NotFoundError
from app.core.storage import get_object_storage
from app.models.blog import BlogPost
from app.models.content import MediaAsset, MediaStatus
from app.models.user import User, UserRole
from app.repositories import blog as repo
from app.repositories import content as content_repo
from app.schemas.blog import (
    BlogCoverPublic,
    BlogMediaPublic,
    BlogPostDetail,
    BlogPostPublic,
    BlogPostSummary,
    BlogPostUpdate,
    BlogPostWrite,
    BlogSectionPublic,
)


class BlogService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    @staticmethod
    def require_editor(user: User) -> None:
        if user.role != UserRole.admin:
            raise ForbiddenError("Редакционный блог доступен только администратору")

    async def list_owned(self, user: User, *, offset: int, limit: int) -> list[BlogPostDetail]:
        self.require_editor(user)
        return [
            self._detail(post)
            for post in await repo.list_owned(self.db, user.id, offset=offset, limit=limit)
        ]

    async def owned(self, user: User, post_id: UUID, *, lock: bool = False) -> BlogPost:
        self.require_editor(user)
        post = await repo.get_owned(self.db, post_id, user.id, lock=lock)
        if post is None:
            raise NotFoundError("Публикация блога не найдена")
        return post

    async def create(self, user: User, body: BlogPostWrite) -> BlogPostDetail:
        self.require_editor(user)
        await self._validate_media(user, body)
        post = BlogPost(
            author_id=user.id,
            slug=body.slug,
            status="draft",
            title=body.title,
            description=body.description,
            category=body.category,
            content=self._content(body),
        )
        self.db.add(post)
        try:
            await self.db.flush()
        except IntegrityError as error:
            raise ConflictError("Публикация с таким slug уже существует") from error
        await self.db.refresh(post)
        return self._detail(post)

    async def update(self, user: User, post_id: UUID, body: BlogPostUpdate) -> BlogPostDetail:
        post = await self.owned(user, post_id, lock=True)
        if post.revision != body.revision:
            raise ConflictError(
                "Публикация изменилась. Прочитайте её заново", details={"reason": "stale_revision"}
            )
        if post.status == "published":
            raise ConflictError("Перед изменением снимите публикацию с блога")
        await self._validate_media(user, body)
        post.slug = body.slug
        post.title = body.title
        post.description = body.description
        post.category = body.category
        post.content = self._content(body)
        post.revision += 1
        post.updated_at = datetime.now(UTC)
        try:
            await self.db.flush()
        except IntegrityError as error:
            raise ConflictError("Публикация с таким slug уже существует") from error
        await self.db.refresh(post)
        return self._detail(post)

    async def publish(self, user: User, post_id: UUID, revision: int) -> BlogPostDetail:
        post = await self.owned(user, post_id, lock=True)
        self._check_revision(post, revision)
        if post.status == "published":
            return self._detail(post)
        post.status = "published"
        post.published_at = post.published_at or datetime.now(UTC)
        post.updated_at = datetime.now(UTC)
        post.revision += 1
        await self.db.flush()
        await self.db.refresh(post)
        return self._detail(post)

    async def unpublish(self, user: User, post_id: UUID, revision: int) -> BlogPostDetail:
        post = await self.owned(user, post_id, lock=True)
        self._check_revision(post, revision)
        if post.status == "draft":
            return self._detail(post)
        post.status = "draft"
        post.updated_at = datetime.now(UTC)
        post.revision += 1
        await self.db.flush()
        await self.db.refresh(post)
        return self._detail(post)

    async def public_list(
        self, *, offset: int = 0, limit: int | None = None
    ) -> list[BlogPostSummary]:
        posts = await repo.list_published(self.db, offset=offset, limit=limit)
        cover_ids = {
            UUID(post.content["cover_media_id"])
            for post in posts
            if post.content.get("cover_media_id")
        }
        covers = {
            asset.id: asset
            for asset in await content_repo.get_media_assets(self.db, cover_ids)
            if asset.status == MediaStatus.ready
        }
        return [self._summary(post, covers) for post in posts]

    async def public_detail(self, slug: str) -> BlogPostPublic:
        post = await repo.by_slug(self.db, slug, published_only=True)
        if post is None:
            raise NotFoundError("Публикация блога не найдена")
        return await self._public(post)

    async def _validate_media(self, user: User, body: BlogPostWrite) -> None:
        ids = {
            media_id
            for section in body.sections
            for media_id in extract_media_ids(section.rich_text)
        }
        if body.cover_media_id:
            ids.add(body.cover_media_id)
        assets = {asset.id: asset for asset in await content_repo.get_media_assets(self.db, ids)}
        if any(media_id not in assets for media_id in ids) or any(
            asset.owner_id != user.id or asset.status != MediaStatus.ready
            for asset in assets.values()
        ):
            raise ConflictError(
                "Все изображения статьи должны принадлежать редактору и быть готовы"
            )

    async def _public(self, post: BlogPost) -> BlogPostPublic:
        content = post.content
        ids = {
            media_id
            for section in content.get("sections", [])
            for media_id in extract_media_ids(section.get("rich_text", ""))
        }
        cover_id = UUID(content["cover_media_id"]) if content.get("cover_media_id") else None
        if cover_id:
            ids.add(cover_id)
        assets = {
            asset.id: asset
            for asset in await content_repo.get_media_assets(self.db, ids)
            if asset.owner_id == post.author_id and asset.status == MediaStatus.ready
        }
        storage = get_object_storage()
        ttl = get_settings().media_download_ttl_seconds
        media = {
            str(asset.id): BlogMediaPublic(
                url=storage.download_url(asset.s3_key, ttl), width=asset.width, height=asset.height
            )
            for asset in assets.values()
        }
        cover_asset = assets.get(cover_id) if cover_id else None
        sections = [
            BlogSectionPublic(
                **section,
                media={
                    str(media_id): media[str(media_id)]
                    for media_id in extract_media_ids(section.get("rich_text", ""))
                    if str(media_id) in media
                },
            )
            for section in content.get("sections", [])
        ]
        if post.published_at is None:
            raise NotFoundError("Публикация блога не найдена")
        return BlogPostPublic(
            slug=post.slug,
            title=post.title,
            description=post.description,
            category=post.category,
            published_at=post.published_at,
            updated_at=post.updated_at,
            tone=content["tone"],
            diagram=tuple(content["diagram"]),
            cover=BlogCoverPublic(src=media[str(cover_id)].url, alt=content["cover_alt"])
            if cover_asset and cover_id
            else None,
            sections=sections,
            sources=content.get("sources", []),
            related=content.get("related", []),
        )

    def _summary(self, post: BlogPost, covers: dict[UUID, MediaAsset]) -> BlogPostSummary:
        if post.published_at is None:
            raise NotFoundError("Публикация блога не найдена")
        content = post.content
        cover_id = UUID(content["cover_media_id"]) if content.get("cover_media_id") else None
        cover = None
        if cover_id:
            asset = covers.get(cover_id)
            if asset and asset.owner_id == post.author_id:
                cover = BlogCoverPublic(
                    src=get_object_storage().download_url(
                        asset.s3_key, get_settings().media_download_ttl_seconds
                    ),
                    alt=content["cover_alt"],
                )
        words = " ".join(
            " ".join(
                [
                    section.get("title", ""),
                    *section.get("paragraphs", []),
                    section.get("rich_text", ""),
                    *section.get("steps", []),
                    (section.get("example") or {}).get("question", ""),
                    (section.get("example") or {}).get("answer", ""),
                ]
            )
            for section in content.get("sections", [])
        ).split()
        return BlogPostSummary(
            slug=post.slug,
            title=post.title,
            description=post.description,
            category=post.category,
            published_at=post.published_at,
            updated_at=post.updated_at,
            tone=content["tone"],
            diagram=tuple(content["diagram"]),
            cover=cover,
            reading_minutes=max(1, (len(words) + 179) // 180),
            related=content.get("related", []),
        )

    @staticmethod
    def _check_revision(post: BlogPost, revision: int) -> None:
        if post.revision != revision:
            raise ConflictError(
                "Публикация изменилась. Прочитайте её заново", details={"reason": "stale_revision"}
            )

    @staticmethod
    def _content(body: BlogPostWrite) -> dict[str, Any]:
        return body.model_dump(
            mode="json", exclude={"slug", "title", "description", "category", "revision"}
        )

    @staticmethod
    def _detail(post: BlogPost) -> BlogPostDetail:
        return BlogPostDetail(
            id=post.id,
            slug=post.slug,
            status=post.status,
            title=post.title,
            description=post.description,
            category=post.category,
            revision=post.revision,
            published_at=post.published_at,
            updated_at=post.updated_at,
            **post.content,
        )
