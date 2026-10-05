"""Точечная и восстановительная синхронизация индекса каталога."""

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import delete, select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.search import SearchIndex
from app.db.session import get_session_factory
from app.models.courses import CourseSearchSync
from app.repositories.search import course_documents, course_ids


async def reconcile(index: SearchIndex) -> None:
    async with get_session_factory()() as db:
        # Транзакционный lock освобождается и при аварии; разные worker не перетрут индекс.
        locked = await db.scalar(text("SELECT pg_try_advisory_xact_lock(72636601)"))
        if not locked:
            return
        await index.configure()
        remaining = await index.document_ids()
        after = None
        while ids := await course_ids(db, after):
            documents = await course_documents(db, ids)
            visible = {document["id"] for document in documents}
            await index.delete(
                [str(course_id) for course_id in ids if str(course_id) not in visible]
            )
            await index.replace(documents)
            remaining.difference_update(str(course_id) for course_id in ids)
            after = ids[-1]
        # В том числе физически удалённые курсы и каскадное удаление аккаунта.
        stale = sorted(remaining)
        for offset in range(0, len(stale), 100):
            await index.delete(stale[offset : offset + 100])


async def queue_course(db: AsyncSession, course_id: UUID) -> None:
    """Схлопывает несколько правок курса в одну задачу в той же транзакции."""
    await db.execute(
        insert(CourseSearchSync)
        .values(course_id=course_id, version=1, requested_at=datetime.now(UTC))
        .on_conflict_do_update(
            index_elements=[CourseSearchSync.course_id],
            set_={
                "version": CourseSearchSync.version + 1,
                "requested_at": datetime.now(UTC),
            },
        )
    )


async def synchronize_pending(index: SearchIndex, *, batch_size: int = 100) -> int:
    """Отправляет только изменившиеся курсы; полная сверка остаётся страховкой."""
    async with get_session_factory()() as db:
        # Та же блокировка, что у полной сверки: две записи в один индекс не перемешиваются.
        locked = await db.scalar(text("SELECT pg_try_advisory_xact_lock(72636601)"))
        if not locked:
            return 0
        pending = list(
            (
                await db.scalars(
                    select(CourseSearchSync)
                    .order_by(CourseSearchSync.requested_at, CourseSearchSync.course_id)
                    .limit(batch_size)
                )
            ).all()
        )
        if not pending:
            return 0
        await index.configure()
        for item in pending:
            documents = await course_documents(db, [item.course_id])
            if documents:
                await index.replace(documents)
            else:
                await index.delete([str(item.course_id)])
            # Если пока шла отправка случилась новая правка, оставляем её в очереди.
            await db.execute(
                delete(CourseSearchSync).where(
                    CourseSearchSync.course_id == item.course_id,
                    CourseSearchSync.version == item.version,
                )
            )
        await db.commit()
        return len(pending)


async def synchronize_courses() -> None:
    settings = get_settings()
    async with SearchIndex.client_for(settings) as client:
        await reconcile(SearchIndex(client, settings.meili_index))


async def synchronize_pending_courses() -> int:
    settings = get_settings()
    async with SearchIndex.client_for(settings) as client:
        return await synchronize_pending(SearchIndex(client, settings.meili_index))
