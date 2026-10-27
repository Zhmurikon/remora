from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import public_read_limit
from app.db.session import get_db
from app.schemas.blog import BlogPostPublic, BlogPostSummary, BlogSitemapEntry
from app.services.blog import BlogService

router = APIRouter(prefix="/blog", tags=["blog"], dependencies=[Depends(public_read_limit)])


@router.get("/posts", response_model=list[BlogPostSummary])
async def list_blog_posts(
    response: Response,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> list[BlogPostSummary]:
    response.headers["Cache-Control"] = "public, max-age=60, stale-while-revalidate=300"
    return await BlogService(db).public_list(offset=offset, limit=limit)


@router.get("/posts/{slug}", response_model=BlogPostPublic)
async def get_blog_post(
    slug: str, response: Response, db: AsyncSession = Depends(get_db)
) -> BlogPostPublic:
    response.headers["Cache-Control"] = "public, max-age=60, stale-while-revalidate=300"
    return await BlogService(db).public_detail(slug)


@router.get("/sitemap", response_model=list[BlogSitemapEntry])
async def blog_sitemap(db: AsyncSession = Depends(get_db)) -> list[BlogSitemapEntry]:
    return [
        BlogSitemapEntry(slug=post.slug, updated_at=post.updated_at)
        for post in await BlogService(db).public_list()
    ]
