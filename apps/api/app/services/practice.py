"""Слияние локального и серверного прогресса практики."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.practice import PythonPracticeProgress
from app.models.user import User
from app.repositories import practice as repo
from app.schemas.practice import PracticeStatus, PythonProgressOut, PythonProgressUpdate

_STATUS_RANK = {
    PracticeStatus.not_started.value: 0,
    PracticeStatus.in_progress.value: 1,
    PracticeStatus.solved.value: 2,
}


class PracticeService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def list_python_progress(self, user: User) -> list[PythonProgressOut]:
        return [
            PythonProgressOut.model_validate(row)
            for row in await repo.list_python_progress(self.db, user.id)
        ]

    async def merge_python_progress(
        self, user: User, task_id: str, body: PythonProgressUpdate
    ) -> PythonProgressOut:
        row = await repo.python_progress_for_update(
            self.db, user.id, task_id, body.task_version
        )
        if row is None:
            row = PythonPracticeProgress(
                user_id=user.id,
                task_id=task_id,
                task_version=body.task_version,
                status=body.status.value,
                attempts=body.attempts,
                draft=body.draft,
                draft_updated_at=body.client_updated_at,
                last_client_mutation_id=body.client_mutation_id,
            )
            self.db.add(row)
        else:
            row.attempts = max(row.attempts, body.attempts)
            if _STATUS_RANK[body.status.value] > _STATUS_RANK[row.status]:
                row.status = body.status.value
            if body.client_updated_at >= row.draft_updated_at:
                row.draft = body.draft
                row.draft_updated_at = body.client_updated_at
                row.last_client_mutation_id = body.client_mutation_id
        await self.db.commit()
        await self.db.refresh(row)
        return PythonProgressOut.model_validate(row)
