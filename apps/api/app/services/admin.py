"""Read-only представление состояния продукта для владельца Remora."""

from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories import admin as repo
from app.schemas.admin import AdminOverview, AdminUserItem, AdminUserList


class AdminService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def overview(self) -> AdminOverview:
        generated_at = datetime.now(UTC)
        record = await repo.overview(self.db, now=generated_at)
        return AdminOverview(generated_at=generated_at, **record.__dict__)

    async def users(self, *, query: str | None, offset: int, limit: int) -> AdminUserList:
        records, total = await repo.users(
            self.db,
            query=query,
            offset=offset,
            limit=limit,
        )
        return AdminUserList(
            items=[
                AdminUserItem(
                    id=record.user.id,
                    email=record.user.email,
                    username=record.user.username,
                    display_name=record.user.display_name,
                    role=record.user.role.value,
                    status=record.user.status.value,
                    email_verified=record.user.email_verified_at is not None,
                    created_at=record.user.created_at,
                    last_active_at=record.last_active_at,
                    sets_count=record.sets_count,
                    courses_count=record.courses_count,
                    reviews_count=record.reviews_count,
                )
                for record in records
            ],
            total=total,
            offset=offset,
            limit=limit,
        )
