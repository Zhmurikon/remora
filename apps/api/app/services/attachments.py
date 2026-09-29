"""Загрузка и защищённая выдача файлов курса."""

from pathlib import Path
from uuid import UUID, uuid4

from botocore.exceptions import BotoCoreError, ClientError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import ConflictError, ForbiddenError, NotFoundError
from app.core.storage import get_object_storage
from app.models.courses import Course, CourseAttachment
from app.models.user import User
from app.repositories import attachments as repo
from app.repositories import courses as course_repo
from app.schemas.attachments import (
    AttachmentDownload,
    AttachmentUploadRequest,
    AttachmentUploadTicket,
    CourseAttachmentPublic,
)


class AttachmentService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.settings = get_settings()

    async def _readable_course(self, user: User, course_id: UUID) -> Course:
        course = await course_repo.get_course(self.db, course_id)
        if course is None:
            raise NotFoundError("Курс не найден")
        if course.owner_id != user.id and (
            not course.is_published or course.moderation_status == "blocked"
        ):
            raise ForbiddenError("Нет доступа к вложениям курса")
        return course

    async def _owned_course(self, user: User, course_id: UUID) -> Course:
        course = await course_repo.get_course(self.db, course_id)
        if course is None:
            raise NotFoundError("Курс не найден")
        if course.owner_id != user.id:
            raise ForbiddenError("Нет доступа к этому курсу")
        return course

    async def create_upload(
        self, user: User, course_id: UUID, body: AttachmentUploadRequest
    ) -> AttachmentUploadTicket:
        await self._owned_course(user, course_id)
        # TODO(E9): проверить feature через Entitlements, когда появятся подписки.
        if body.size_bytes > self.settings.course_attachment_max_size_bytes:
            raise ConflictError(
                "Файл слишком большой",
                details={"max_size_bytes": self.settings.course_attachment_max_size_bytes},
            )
        if body.article_id is not None:
            articles = await course_repo.articles(self.db, course_id)
            if body.article_id not in {article.id for article in articles}:
                raise ConflictError("Статья не принадлежит курсу")
        attachment_id = uuid4()
        suffix = Path(body.filename).suffix.lower()[:20]
        key = f"users/{user.id}/attachments/{attachment_id}{suffix}"
        attachment = CourseAttachment(
            id=attachment_id,
            course_id=course_id,
            article_id=body.article_id,
            filename=body.filename,
            mime=body.mime,
            size_bytes=body.size_bytes,
            s3_key=key,
        )
        self.db.add(attachment)
        await self.db.flush()
        return AttachmentUploadTicket(
            id=attachment.id,
            upload_url=get_object_storage().upload_url(
                key, body.mime, self.settings.media_upload_ttl_seconds
            ),
            headers={"Content-Type": body.mime},
            expires_in=self.settings.media_upload_ttl_seconds,
        )

    async def complete(
        self, user: User, course_id: UUID, attachment_id: UUID
    ) -> CourseAttachmentPublic:
        await self._owned_course(user, course_id)
        attachment = await self._attachment(course_id, attachment_id)
        if attachment.status == "ready":
            return self._public(attachment)
        try:
            actual_size = await get_object_storage().size(attachment.s3_key)
        except (BotoCoreError, ClientError) as exc:
            raise ConflictError("Файл ещё не загружен") from exc
        if actual_size <= 0 or actual_size > self.settings.course_attachment_max_size_bytes:
            await get_object_storage().delete(attachment.s3_key)
            await self.db.delete(attachment)
            await self.db.flush()
            raise ConflictError("Файл слишком большой или пустой")
        attachment.size_bytes = actual_size
        attachment.status = "ready"
        await self.db.flush()
        return self._public(attachment)

    async def list(self, user: User, course_id: UUID) -> list[CourseAttachmentPublic]:
        await self._readable_course(user, course_id)
        return [
            self._public(item)
            for item in await repo.list_for_course(self.db, course_id)
            if item.status == "ready"
        ]

    async def download(
        self, user: User, course_id: UUID, attachment_id: UUID
    ) -> AttachmentDownload:
        await self._readable_course(user, course_id)
        attachment = await self._attachment(course_id, attachment_id)
        if attachment.status != "ready":
            raise NotFoundError("Вложение не найдено")
        ttl = self.settings.media_download_ttl_seconds
        return AttachmentDownload(
            url=get_object_storage().attachment_download_url(
                attachment.s3_key, attachment.filename, ttl
            ),
            expires_in=ttl,
        )

    async def delete(self, user: User, course_id: UUID, attachment_id: UUID) -> None:
        await self._owned_course(user, course_id)
        attachment = await self._attachment(course_id, attachment_id)
        await get_object_storage().delete(attachment.s3_key)
        await self.db.delete(attachment)
        await self.db.flush()

    async def delete_objects_for(
        self, course_id: UUID, *, article_ids: set[UUID] | None = None
    ) -> None:
        """Удаляет объекты перед каскадным удалением их строк из базы."""
        attachments = await repo.list_for_course(self.db, course_id)
        if article_ids is not None:
            attachments = [item for item in attachments if item.article_id in article_ids]
        await get_object_storage().delete_many([item.s3_key for item in attachments])

    async def _attachment(self, course_id: UUID, attachment_id: UUID) -> CourseAttachment:
        attachment = await repo.get(self.db, attachment_id)
        if attachment is None or attachment.course_id != course_id:
            raise NotFoundError("Вложение не найдено")
        return attachment

    @staticmethod
    def _public(attachment: CourseAttachment) -> CourseAttachmentPublic:
        return CourseAttachmentPublic(
            id=attachment.id,
            article_id=attachment.article_id,
            filename=attachment.filename,
            mime=attachment.mime,
            size_bytes=attachment.size_bytes,
            created_at=attachment.created_at,
        )
