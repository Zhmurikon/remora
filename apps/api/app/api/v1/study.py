"""Движок обучения: очередь, приём ответов, сессии, статистика и настройки FSRS.

Ни один эндпоинт здесь не проверяет тариф: обучение не лимитируется ни в каком
виде — см. раздел 3 в docs/04-limits.md.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import current_user
from app.db.session import get_db
from app.models.study import StudyMode
from app.models.user import User
from app.schemas.study import (
    DirectionMode,
    ForecastDay,
    QueueScope,
    ReviewBatch,
    ReviewBatchResult,
    SessionCreate,
    SessionOut,
    SetLearnSettingsOut,
    SetLearnSettingsUpdate,
    SetStats,
    StudyQueue,
    StudySettingsOut,
    StudySettingsUpdate,
)
from app.schemas.test_mode import TestAttemptOut, TestConfig, TestResult, TestSubmit
from app.services.study import DEFAULT_QUEUE_LIMIT, FORECAST_DAYS, MAX_QUEUE_LIMIT, StudyService
from app.services.test_mode import TestModeService

router = APIRouter(prefix="/study", tags=["study"])


@router.post(
    "/sets/{set_id}/reset",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Сбросить свой прогресс набора в обоих направлениях",
)
async def reset_progress(
    set_id: UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> None:
    await StudyService(db).reset_progress(user, set_id)


@router.get("/settings", response_model=StudySettingsOut, summary="Настройки обучения")
async def get_study_settings(
    user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> StudySettingsOut:
    settings = await StudyService(db).get_settings(user)
    return StudySettingsOut.model_validate(settings)


@router.get(
    "/sets/{set_id}/learn-settings",
    response_model=SetLearnSettingsOut,
    summary="Настройки заучивания для набора",
)
async def get_set_learn_settings(
    set_id: UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> SetLearnSettingsOut:
    return await StudyService(db).get_set_learn_settings(user, set_id)


@router.put(
    "/sets/{set_id}/learn-settings",
    response_model=SetLearnSettingsOut,
    summary="Переопределить настройки заучивания для набора",
)
async def update_set_learn_settings(
    set_id: UUID,
    body: SetLearnSettingsUpdate,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> SetLearnSettingsOut:
    return await StudyService(db).update_set_learn_settings(user, set_id, body)


@router.delete(
    "/sets/{set_id}/learn-settings",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Вернуть общие настройки заучивания для набора",
)
async def reset_set_learn_settings(
    set_id: UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> None:
    await StudyService(db).reset_set_learn_settings(user, set_id)


@router.patch("/settings", response_model=StudySettingsOut, summary="Изменить настройки обучения")
async def update_study_settings(
    body: StudySettingsUpdate,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> StudySettingsOut:
    settings = await StudyService(db).update_settings(user, body)
    return StudySettingsOut.model_validate(settings)


@router.get(
    "/sets/{set_id}/queue", response_model=StudyQueue, summary="Очередь карточек на тренировку"
)
async def get_queue(
    set_id: UUID,
    mode: StudyMode = StudyMode.learn,
    scope: QueueScope = QueueScope.due,
    direction: DirectionMode = DirectionMode.term_to_def,
    limit: int = Query(default=DEFAULT_QUEUE_LIMIT, ge=1, le=MAX_QUEUE_LIMIT),
    shuffle: bool = True,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> StudyQueue:
    return await StudyService(db).get_queue(
        user,
        set_id,
        mode=mode,
        scope=scope,
        direction=direction,
        limit=limit,
        shuffle=shuffle,
    )


@router.get("/sets/{set_id}/stats", response_model=SetStats, summary="Статистика по набору")
async def get_set_stats(
    set_id: UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> SetStats:
    return await StudyService(db).get_set_stats(user, set_id)


@router.get(
    "/forecast", response_model=list[ForecastDay], summary="Прогноз нагрузки на ближайшие дни"
)
async def get_forecast(
    days: int = Query(default=FORECAST_DAYS, ge=1, le=60),
    set_id: UUID | None = None,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ForecastDay]:
    return await StudyService(db).get_forecast(user, days=days, set_id=set_id)


@router.post(
    "/sessions",
    response_model=SessionOut,
    status_code=status.HTTP_201_CREATED,
    summary="Начать тренировку",
)
async def start_session(
    body: SessionCreate, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> SessionOut:
    session = await StudyService(db).start_session(user, body)
    return SessionOut.model_validate(session)


@router.get(
    "/sessions/active", response_model=SessionOut | None, summary="Незавершённая тренировка"
)
async def get_active_session(
    set_id: UUID,
    mode: StudyMode | None = None,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> SessionOut | None:
    session = await StudyService(db).get_active_session(user, set_id, mode)
    return SessionOut.model_validate(session) if session is not None else None


@router.post(
    "/sessions/{session_id}/finish", response_model=SessionOut, summary="Завершить тренировку"
)
async def finish_session(
    session_id: UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> SessionOut:
    session = await StudyService(db).finish_session(user, session_id)
    return SessionOut.model_validate(session)


@router.post("/reviews", response_model=ReviewBatchResult, summary="Отправить ответы батчем")
async def submit_reviews(
    body: ReviewBatch, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> ReviewBatchResult:
    return await StudyService(db).submit_reviews(user, body)


@router.post(
    "/sets/{set_id}/tests",
    response_model=TestAttemptOut,
    status_code=status.HTTP_201_CREATED,
    summary="Собрать тест по набору",
)
async def create_test(
    set_id: UUID,
    body: TestConfig,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> TestAttemptOut:
    return await TestModeService(db).create_attempt(user, set_id, body)


@router.get("/tests/{attempt_id}", response_model=TestAttemptOut, summary="Попытка теста")
async def get_test(
    attempt_id: UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> TestAttemptOut:
    return await TestModeService(db).get_attempt(user, attempt_id)


@router.post(
    "/tests/{attempt_id}/submit", response_model=TestResult, summary="Проверить ответы теста"
)
async def submit_test(
    attempt_id: UUID,
    body: TestSubmit,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> TestResult:
    return await TestModeService(db).submit(user, attempt_id, body)


@router.get("/tests/{attempt_id}/result", response_model=TestResult, summary="Разбор теста")
async def get_test_result(
    attempt_id: UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> TestResult:
    return await TestModeService(db).get_result(user, attempt_id)


@router.post(
    "/tests/{attempt_id}/retake",
    response_model=TestAttemptOut,
    status_code=status.HTTP_201_CREATED,
    summary="Пересдать ошибки",
)
async def retake_test(
    attempt_id: UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> TestAttemptOut:
    return await TestModeService(db).retake(user, attempt_id)
