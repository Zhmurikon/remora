"""Периодическая сверка индекса с БД восстанавливает пропущенные изменения после сбоя."""

from sqlalchemy import text

from app.core.config import get_settings
from app.core.search import SearchIndex
from app.db.session import get_session_factory
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


async def synchronize_courses() -> None:
    settings = get_settings()
    async with SearchIndex.client_for(settings) as client:
        await reconcile(SearchIndex(client, settings.meili_index))
