from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.courses import CourseArticle
from app.models.generations import GenerationJob, NoteRevision


async def before_article_change(db: AsyncSession, article: CourseArticle, new_body: str) -> None:
    if not article.id:
        return
    note = await db.scalar(select(GenerationJob).where(GenerationJob.article_id == article.id))
    if note is None:
        return
    if article.body != new_body:
        db.add(NoteRevision(note_id=note.id, markdown=article.body))
    # Снимок нужен при удалении урока: самостоятельный конспект не теряется.
    note.markdown = new_body
    note.title = article.title
    note.updated_at = datetime.now(UTC)
