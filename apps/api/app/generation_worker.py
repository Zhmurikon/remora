"""Оплата не повторяется автоматически даже после потери ответа или рестарта worker."""

import logging
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import select

from app.core.errors import AppError
from app.db.session import get_session_factory
from app.models.generations import GenerationJob
from app.schemas.generations import GeneratedCards
from app.services import generation_provider as provider
from app.services.generations import settle_quota

logger = logging.getLogger(__name__)


async def process_generation(_context: dict[str, Any], job_id_value: str) -> None:
    job_id = UUID(job_id_value)
    async with get_session_factory()() as db:
        job = await db.scalar(
            select(GenerationJob).where(GenerationJob.id == job_id).with_for_update()
        )
        if job is None or job.status != "queued":
            return
        job.status = "processing"
        job.started_at = datetime.now(UTC)
        body = dict(job.request_body)
        await db.commit()
    raw: dict[str, Any] | None = None
    error: str | None = None
    markdown: str | None = None
    cards: list[dict[str, Any]] | None = None
    try:
        body = await provider.prepare(body)
        async with get_session_factory()() as db:
            job = await db.get(GenerationJob, job_id)
            if job is None or job.status != "processing":
                return
            job.request_body = body
            await db.commit()
        raw = await provider.generate(body)
        content = provider.result_text(raw)
        if body["model"] == provider.NOTES_MODEL:
            markdown = content
        else:
            cards = [
                card.model_dump() for card in GeneratedCards.model_validate_json(content).cards
            ]
    except Exception as exc:  # noqa: BLE001 — любое завершение возвращает резерв квоты
        # Тело ошибки провайдера и исходный материал не должны попасть в журнал сервера.
        logger.warning("generation_failed job=%s type=%s", job_id, type(exc).__name__)
        error = (
            exc.message
            if isinstance(exc, AppError)
            else "Не удалось подготовить материал. Повторите запуск вручную"
        )
    async with get_session_factory()() as db:
        job = await db.scalar(
            select(GenerationJob).where(GenerationJob.id == job_id).with_for_update()
        )
        if job is None or job.status != "processing":
            return
        job.provider_response = raw
        usage = raw.get("usage") if raw else None
        if usage:
            job.input_tokens = int(usage["input_tokens"])
            job.output_tokens = int(usage["output_tokens"])
            job.estimated_cost_usd = provider.cost_usd(job.model, usage)
        job.markdown = markdown
        job.cards = cards
        job.status = "failed" if error else "completed"
        job.error_message = error
        job.finished_at = datetime.now(UTC)
        await settle_quota(db, job, successful=error is None)
        await db.commit()


async def recover_generations(context: dict[str, Any]) -> None:
    async with get_session_factory()() as db:
        stale = list(
            (
                await db.scalars(
                    select(GenerationJob)
                    .where(
                        GenerationJob.status == "processing",
                        GenerationJob.started_at < datetime.now(UTC) - timedelta(minutes=10),
                    )
                    .with_for_update(skip_locked=True)
                )
            ).all()
        )
        for job in stale:
            job.status = "failed"
            job.error_message = (
                "Обработка прервалась. Результат не получен; "
                "автоматического повторного запроса не было"
            )
            job.finished_at = datetime.now(UTC)
            await settle_quota(db, job, successful=False)
        queued = list(
            (
                await db.scalars(
                    select(GenerationJob.id).where(GenerationJob.status == "queued").limit(100)
                )
            ).all()
        )
        await db.commit()
    for job_id in queued:
        # Другой ключ очереди позволяет восстановить потерянную доставку. Захват в БД однократный.
        await context["redis"].enqueue_job(
            "process_generation",
            str(job_id),
            _job_id=f"generation-recover:{job_id}:{int(datetime.now(UTC).timestamp()) // 60}",
        )
