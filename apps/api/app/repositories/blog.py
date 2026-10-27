from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.blog import BlogPost
from app.models.user import User


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


async def admin_list(
    db: AsyncSession,
    *,
    query: str | None,
    status: str | None,
    offset: int,
    limit: int,
) -> tuple[list[tuple[BlogPost, User]], int]:
    filters = []
    if query:
        pattern = f"%{query}%"
        filters.append(
            or_(
                BlogPost.title.ilike(pattern),
                BlogPost.slug.ilike(pattern),
                BlogPost.category.ilike(pattern),
                User.username.ilike(pattern),
            )
        )
    if status == "published":
        now = datetime.now(UTC)
        filters.append(
            or_(
                BlogPost.status == "published",
                (BlogPost.status == "scheduled") & (BlogPost.published_at <= now),
            )
        )
    elif status == "scheduled":
        filters.extend(
            [
                BlogPost.status == "scheduled",
                BlogPost.published_at > datetime.now(UTC),
            ]
        )
    elif status:
        filters.append(BlogPost.status == status)
    base = select(BlogPost, User).join(User, User.id == BlogPost.author_id).where(*filters)
    total = int((await db.scalar(select(func.count()).select_from(base.subquery()))) or 0)
    rows = await db.execute(
        base.order_by(BlogPost.updated_at.desc(), BlogPost.id.desc()).offset(offset).limit(limit)
    )
    return [(row[0], row[1]) for row in rows.all()], total


async def get_any(db: AsyncSession, post_id: UUID, *, lock: bool = False) -> BlogPost | None:
    statement = select(BlogPost).where(BlogPost.id == post_id)
    if lock:
        statement = statement.with_for_update()
    result: BlogPost | None = await db.scalar(statement)
    return result


async def author(db: AsyncSession, author_id: UUID) -> User | None:
    return await db.get(User, author_id)


async def by_slug(db: AsyncSession, slug: str, *, published_only: bool = False) -> BlogPost | None:
    statement = select(BlogPost).where(BlogPost.slug == slug)
    if published_only:
        now = datetime.now(UTC)
        statement = statement.where(
            BlogPost.published_at.is_not(None),
            BlogPost.published_at <= now,
            BlogPost.status.in_(["published", "scheduled"]),
        )
    result: BlogPost | None = await db.scalar(statement)
    return result


async def list_published(
    db: AsyncSession, *, offset: int = 0, limit: int | None = None
) -> list[BlogPost]:
    statement = (
        select(BlogPost)
        .where(
            BlogPost.published_at.is_not(None),
            BlogPost.published_at <= datetime.now(UTC),
            BlogPost.status.in_(["published", "scheduled"]),
        )
        .order_by(BlogPost.published_at.desc(), BlogPost.slug)
        .offset(offset)
    )
    if limit is not None:
        statement = statement.limit(limit)
    return list((await db.scalars(statement)).all())
