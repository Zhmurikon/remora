"""Управление редакционным блогом из защищённой административной панели."""

import hashlib
import json
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, NotFoundError
from app.models.blog import BlogPost
from app.models.user import User
from app.repositories import admin_security as security_repo
from app.repositories import blog as repo
from app.schemas.admin_blog import (
    AdminBlogHistoryItem,
    AdminBlogPostDetail,
    AdminBlogPostItem,
    AdminBlogPostList,
)
from app.schemas.blog import BlogPostUpdate, BlogPostWrite
from app.services.blog import BlogService


class AdminBlogService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.blog = BlogService(db)

    async def posts(
        self, *, query: str | None, status: str | None, offset: int, limit: int
    ) -> AdminBlogPostList:
        rows, total = await repo.admin_list(
            self.db, query=query, status=status, offset=offset, limit=limit
        )
        return AdminBlogPostList(
            items=[self._item(post, author.username) for post, author in rows],
            total=total,
            offset=offset,
            limit=limit,
        )

    async def post(self, post_id: UUID) -> AdminBlogPostDetail:
        post = await repo.get_any(self.db, post_id)
        if post is None:
            raise NotFoundError("Публикация блога не найдена")
        author = await repo.author(self.db, post.author_id)
        if author is None:
            raise NotFoundError("Автор публикации не найден")
        history = await security_repo.target_history(
            self.db, target_type="blog_post", target_id=post.id
        )
        return AdminBlogPostDetail(
            **self.blog._detail(post).model_dump(),
            state=self._state(post),
            author_id=author.id,
            author_username=author.username,
            history=[
                AdminBlogHistoryItem(
                    id=audit.id,
                    action=audit.action,
                    actor_username=username,
                    reason=audit.reason,
                    details=audit.details,
                    created_at=audit.created_at,
                )
                for audit, username in history
            ],
        )

    async def create(
        self,
        *,
        actor: User,
        body: BlogPostWrite,
        idempotency_key: str,
        ip: str | None,
        user_agent: str | None,
    ) -> AdminBlogPostDetail:
        payload = body.model_dump(mode="json")
        existing = await self._repeated_create(actor, payload, idempotency_key)
        if existing is not None:
            return await self.post(existing)
        created = await self.blog.create(actor, body)
        await security_repo.add_audit(
            self.db,
            actor_user_id=actor.id,
            action="admin.blog.created",
            outcome="success",
            target_type="blog_post",
            target_id=created.id,
            reason="Создание черновика",
            idempotency_key=idempotency_key,
            ip=ip,
            user_agent=user_agent,
            details={
                "request_hash": self._request_hash("admin.blog.created", None, payload),
                "revision": created.revision,
                "slug": created.slug,
            },
        )
        return await self.post(created.id)

    async def update(
        self,
        *,
        actor: User,
        post_id: UUID,
        body: BlogPostUpdate,
        idempotency_key: str,
        ip: str | None,
        user_agent: str | None,
    ) -> AdminBlogPostDetail:
        post = await self._locked(post_id)
        payload = body.model_dump(mode="json")
        if await self._repeated(actor, "admin.blog.updated", post_id, payload, idempotency_key):
            return await self.post(post_id)
        previous_revision = post.revision
        changed = await self.blog.update_post(post, body)
        await self._audit(
            actor=actor,
            action="admin.blog.updated",
            post=post,
            reason="Редактирование черновика",
            idempotency_key=idempotency_key,
            ip=ip,
            user_agent=user_agent,
            payload=payload,
            details={"old_revision": previous_revision, "new_revision": changed.revision},
        )
        return await self.post(post_id)

    async def publication_action(
        self,
        *,
        actor: User,
        post_id: UUID,
        action: str,
        revision: int,
        reason: str,
        publish_at: datetime | None,
        idempotency_key: str,
        ip: str | None,
        user_agent: str | None,
    ) -> AdminBlogPostDetail:
        post = await self._locked(post_id)
        audit_action = f"admin.blog.{action}"
        payload = {
            "action": action,
            "revision": revision,
            "reason": reason,
            "publish_at": publish_at,
        }
        if await self._repeated(actor, audit_action, post_id, payload, idempotency_key):
            return await self.post(post_id)
        previous = {"status": post.status, "published_at": post.published_at}
        if action == "unpublish":
            changed = await self.blog.unpublish_post(post, revision)
        elif action == "publish":
            changed = await self.blog.publish_post(post, revision)
        elif action == "schedule":
            if publish_at is None or publish_at <= datetime.now(UTC):
                raise ConflictError("Дата отложенной публикации должна быть в будущем")
            changed = await self.blog.publish_post(post, revision, published_at=publish_at)
        else:
            raise ConflictError("Неизвестное действие с публикацией")
        await self._audit(
            actor=actor,
            action=audit_action,
            post=post,
            reason=reason,
            idempotency_key=idempotency_key,
            ip=ip,
            user_agent=user_agent,
            payload=payload,
            details={
                "old": previous,
                "new": {
                    "status": changed.status,
                    "published_at": changed.published_at,
                    "revision": changed.revision,
                },
            },
        )
        return await self.post(post_id)

    async def _locked(self, post_id: UUID) -> BlogPost:
        post = await repo.get_any(self.db, post_id, lock=True)
        if post is None:
            raise NotFoundError("Публикация блога не найдена")
        return post

    async def _audit(
        self,
        *,
        actor: User,
        action: str,
        post: BlogPost,
        reason: str,
        idempotency_key: str,
        ip: str | None,
        user_agent: str | None,
        payload: dict[str, Any],
        details: dict[str, Any],
    ) -> None:
        await security_repo.add_audit(
            self.db,
            actor_user_id=actor.id,
            action=action,
            outcome="success",
            target_type="blog_post",
            target_id=post.id,
            reason=reason,
            idempotency_key=idempotency_key,
            ip=ip,
            user_agent=user_agent,
            details={
                "request_hash": self._request_hash(action, post.id, payload),
                "slug": post.slug,
                **json.loads(json.dumps(details, default=str)),
            },
        )

    async def _repeated_create(
        self, actor: User, payload: dict[str, Any], idempotency_key: str
    ) -> UUID | None:
        existing = await security_repo.get_audit_by_idempotency(self.db, idempotency_key)
        if existing is None:
            return None
        expected = self._request_hash("admin.blog.created", None, payload)
        if (
            existing.actor_user_id != actor.id
            or existing.action != "admin.blog.created"
            or existing.target_id is None
            or existing.details.get("request_hash") != expected
        ):
            raise ConflictError("Ключ идемпотентности уже использован для другого действия")
        return existing.target_id

    async def _repeated(
        self,
        actor: User,
        action: str,
        target_id: UUID,
        payload: dict[str, Any],
        idempotency_key: str,
    ) -> bool:
        existing = await security_repo.get_audit_by_idempotency(self.db, idempotency_key)
        if existing is None:
            return False
        expected = self._request_hash(action, target_id, payload)
        if (
            existing.actor_user_id != actor.id
            or existing.action != action
            or existing.target_id != target_id
            or existing.details.get("request_hash") != expected
        ):
            raise ConflictError("Ключ идемпотентности уже использован для другого действия")
        return True

    @staticmethod
    def _request_hash(action: str, target_id: UUID | None, payload: dict[str, Any]) -> str:
        value = json.dumps(
            {
                "action": action,
                "target_id": str(target_id) if target_id else None,
                "payload": payload,
            },
            sort_keys=True,
            ensure_ascii=False,
            default=str,
            separators=(",", ":"),
        )
        return hashlib.sha256(value.encode()).hexdigest()

    @staticmethod
    def _state(post: BlogPost) -> str:
        if (
            post.status == "scheduled"
            and post.published_at
            and post.published_at <= datetime.now(UTC)
        ):
            return "published"
        return post.status

    @classmethod
    def _item(cls, post: BlogPost, author_username: str) -> AdminBlogPostItem:
        return AdminBlogPostItem(
            id=post.id,
            slug=post.slug,
            title=post.title,
            description=post.description,
            category=post.category,
            state=cls._state(post),
            revision=post.revision,
            author_id=post.author_id,
            author_username=author_username,
            published_at=post.published_at,
            updated_at=post.updated_at,
        )
