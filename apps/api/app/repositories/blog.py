from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.blog import BlogPost


async def list_owned(
    db: AsyncSession, author_id: UUID, *, offset: int, limit: int
) -> list[BlogPost]:
    return list(
        (
            await db.scalars(
                select(BlogPost)
                .where(BlogPost.author_id == author_id)
                .order_by(BlogPost.updated_at.desc())
                .offset(offset)
                .limit(limit)
            )
        ).all()
    )


async def get_owned(
    db: AsyncSession, post_id: UUID, author_id: UUID, *, lock: bool = False
) -> BlogPost | None:
    statement = select(BlogPost).where(BlogPost.id == post_id, BlogPost.author_id == author_id)
    if lock:
        statement = statement.with_for_update()
    result: BlogPost | None = await db.scalar(statement)
    return result


async def by_slug(db: AsyncSession, slug: str, *, published_only: bool = False) -> BlogPost | None:
    statement = select(BlogPost).where(BlogPost.slug == slug)
    if published_only:
        statement = statement.where(BlogPost.status == "published")
    result: BlogPost | None = await db.scalar(statement)
    return result


async def list_published(
    db: AsyncSession, *, offset: int = 0, limit: int | None = None
) -> list[BlogPost]:
    statement = (
        select(BlogPost)
        .where(BlogPost.status == "published")
        .order_by(BlogPost.published_at.desc(), BlogPost.slug)
        .offset(offset)
    )
    if limit is not None:
        statement = statement.limit(limit)
    return list((await db.scalars(statement)).all())
