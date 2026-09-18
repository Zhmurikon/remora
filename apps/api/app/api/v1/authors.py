"""Индексируемые публичные профили авторов."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.schemas.authors import AuthorProfile
from app.services.authors import AuthorService

router = APIRouter(prefix="/authors", tags=["authors"])


@router.get("/{username}", response_model=AuthorProfile, summary="Публичный профиль автора")
async def author_profile(username: str, db: AsyncSession = Depends(get_db)) -> AuthorProfile:
    return await AuthorService(db).profile(username)
