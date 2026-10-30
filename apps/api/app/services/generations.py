import hashlib
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import ConflictError, NotFoundError, ValidationError
from app.models.content import SetVisibility
from app.models.generations import GenerationJob
from app.models.transcriptions import TranscriptionStatus
from app.models.user import User
from app.repositories import generations as repo
from app.repositories.api_tokens import lock_request
from app.schemas.content import CardBatch, CardWrite, SetCreate
from app.schemas.generations import (
    GeneratedCard,
    GenerationCreate,
    GenerationPublic,
    GenerationSaveSet,
    GenerationUpdate,
    card_issues,
)
from app.services import generation_provider as provider
from app.services.content import ContentService
from app.services.entitlements import Entitlements, week_period
from app.services.transcriptions import TranscriptionService

LIMIT = "ai.generation_tokens_per_week"
METRIC = "ai_generation_tokens"


class GenerationService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get(self, user: User, job_id: UUID, *, lock: bool = False) -> GenerationJob:
        job = await repo.get(self.db, user.id, job_id, lock=lock)
        if job is None:
            raise NotFoundError("Материал не найден")
        return job

    async def list(self, user: User, source_id: UUID) -> list[GenerationJob]:
        await TranscriptionService(self.db).get_for_user(user, source_id)
        return await repo.list_for_source(self.db, user.id, source_id)

    async def create(self, user: User, source_id: UUID, body: GenerationCreate) -> GenerationJob:
        await lock_request(self.db, user.id)
        source = await TranscriptionService(self.db).get_for_user(user, source_id)
        previous = await repo.by_request(self.db, user.id, body.request_id)
        if previous:
            if (previous.transcription_id, previous.kind, previous.parent_id) != (
                source_id,
                body.kind,
                body.parent_id,
            ):
                raise ConflictError("Идентификатор запроса уже использован")
            return previous
        for active in await repo.list_for_source(self.db, user.id, source_id):
            if active.status in {"queued", "processing"}:
                raise ConflictError("Дождитесь завершения текущей генерации")
        await Entitlements(self.db).require_feature(user, "ai.generation")
        key = get_settings().open_ai_api_key
        if not key or not key.get_secret_value():
            raise ValidationError("Генерация временно недоступна")
        if source.status != TranscriptionStatus.completed:
            raise ConflictError("Дождитесь готовой расшифровки")
        text = source.result_text or ""
        if body.kind == "cards":
            if body.parent_id is None:
                raise ValidationError("Сначала подготовьте конспект")
            parent = await self.get(user, body.parent_id)
            if (
                parent.transcription_id != source_id
                or parent.kind != "notes"
                or parent.status != "completed"
            ):
                raise ConflictError("Выберите готовый конспект этой расшифровки")
            text = parent.markdown or ""
        elif body.parent_id is not None:
            raise ValidationError("Для конспекта источник — расшифровка")
        if not text.strip() or len(text) > 100_000:
            raise ValidationError("Нужен непустой текст не длиннее 100 000 символов")
        title = source.title or source.filename
        request = provider.build_request(body.kind, title, text)
        reserve = provider.reserve_tokens(request)
        period, reset = week_period()
        await Entitlements(self.db).consume(
            user, LIMIT, amount=reserve, period_key=period, resets_at=reset, counter_metric=METRIC
        )
        job = GenerationJob(
            user_id=user.id,
            transcription_id=source_id,
            request_id=body.request_id,
            kind=body.kind,
            title=title,
            source_text=text,
            source_hash=hashlib.sha256(text.encode()).hexdigest(),
            parent_id=body.parent_id,
            model=request["model"],
            prompt_version=provider.PROMPT_VERSION,
            request_body=request,
            reserved_tokens=reserve,
            quota_period_key=period,
        )
        self.db.add(job)
        await self.db.flush()
        return job

    async def update(self, user: User, job_id: UUID, body: GenerationUpdate) -> GenerationJob:
        job = await self.get(user, job_id, lock=True)
        self._editable(job, body.revision)
        if job.kind == "notes" and body.markdown is not None and body.cards is None:
            if not body.markdown.strip():
                raise ValidationError("Конспект не может быть пустым")
            job.markdown = body.markdown
        elif job.kind == "cards" and body.cards is not None and body.markdown is None:
            job.cards = [card.model_dump() for card in body.cards]
        else:
            raise ValidationError("Изменение не соответствует виду материала")
        job.updated_at = datetime.now(UTC)
        await self.db.flush()
        return job

    async def save_set(self, user: User, job_id: UUID, body: GenerationSaveSet) -> GenerationJob:
        await lock_request(self.db, user.id)
        job = await self.get(user, job_id, lock=True)
        if job.saved_set_id:
            return job
        self._editable(job, body.revision)
        cards = [GeneratedCard.model_validate(card) for card in job.cards or []]
        if job.kind != "cards" or not cards:
            raise ValidationError("Нет карточек для сохранения")
        issues = card_issues(cards)
        if issues:
            raise ValidationError(
                "Исправьте карточки перед сохранением", details={"issues": issues}
            )
        content = ContentService(self.db)
        study_set = await content.create_set(
            user, SetCreate(title=body.title, visibility=SetVisibility.private)
        )
        await content.sync_cards(
            user, study_set.id, CardBatch(cards=[CardWrite(**card.model_dump()) for card in cards])
        )
        job.saved_set_id = study_set.id
        await self.db.flush()
        return job

    @staticmethod
    def _editable(job: GenerationJob, revision: datetime) -> None:
        if job.status != "completed" or job.saved_set_id:
            raise ConflictError(
                "Этот результат нельзя изменить; сохранённый набор редактируется отдельно"
            )
        if job.updated_at != revision:
            raise ConflictError(
                "Материал изменён в другой вкладке. Обновите страницу перед сохранением"
            )

    @staticmethod
    def public(job: GenerationJob) -> GenerationPublic:
        result = GenerationPublic.model_validate(job)
        result.issues = card_issues(result.cards or [])
        return result


async def settle_quota(db: AsyncSession, job: GenerationJob, *, successful: bool) -> None:
    if job.quota_settled:
        return
    user = await db.get(User, job.user_id)
    used = (job.input_tokens or 0) + (job.output_tokens or 0) if successful else 0
    release = max(0, job.reserved_tokens - used)
    if user and release:
        await Entitlements(db).release(
            user, LIMIT, amount=release, period_key=job.quota_period_key, counter_metric=METRIC
        )
    job.quota_settled = True
