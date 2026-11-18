"""Долговечная последовательность: источники → конспект → карточки."""

import logging
from typing import Any

from sqlalchemy import select

from app.core.errors import AppError
from app.db.session import get_session_factory
from app.models.generations import AssistantTask
from app.models.user import User
from app.services.assistant import AssistantService

logger = logging.getLogger(__name__)


async def advance_assistant_tasks(_context: dict[str, Any]) -> None:
    async with get_session_factory()() as db:
        ids = list(
            (
                await db.scalars(
                    select(AssistantTask.id)
                    .where(AssistantTask.status.not_in(["completed", "failed"]))
                    .order_by(AssistantTask.created_at)
                    .limit(100)
                )
            ).all()
        )
    for task_id in ids:
        async with get_session_factory()() as db:
            task = await db.get(AssistantTask, task_id)
            if task is None:
                continue
            user = await db.get(User, task.user_id)
            if user is None:
                continue
            try:
                async with db.begin_nested():
                    await AssistantService(db).advance(user, task)
            except AppError as exc:
                task.status, task.error_message = "failed", exc.message
            except Exception as exc:  # noqa: BLE001 — временный сбой повторится без новой генерации
                logger.warning(
                    "assistant_task_deferred task=%s type=%s", task_id, type(exc).__name__
                )
                continue
            await db.commit()
