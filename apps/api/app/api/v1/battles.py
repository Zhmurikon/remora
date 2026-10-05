"""HTTP API соревновательных битв 1×1."""

from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.battles import (
    BattleAnswerIn,
    BattleAnswerOut,
    BattleCreate,
    BattleCreateOut,
    BattleJoin,
    BattleRematch,
    BattleResultOut,
    BattleRoomOut,
)
from app.services.battles import BattleService

router = APIRouter(prefix="/battles", tags=["battles"])


@router.post(
    "",
    response_model=BattleCreateOut,
    status_code=status.HTTP_201_CREATED,
    summary="Создать битву и ссылку-приглашение",
)
async def create_battle(
    body: BattleCreate,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> BattleCreateOut:
    return await BattleService(db).create(user, body)


@router.post("/join", response_model=BattleRoomOut, summary="Войти в битву по приглашению")
async def join_battle(
    body: BattleJoin,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> BattleRoomOut:
    return await BattleService(db).join(user, body.invite_token)


@router.get("/{battle_id}", response_model=BattleRoomOut, summary="Состояние комнаты битвы")
async def get_battle(
    battle_id: UUID,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> BattleRoomOut:
    return await BattleService(db).get(user, battle_id)


@router.post("/{battle_id}/ready", response_model=BattleRoomOut, summary="Подтвердить готовность")
async def ready_for_battle(
    battle_id: UUID,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> BattleRoomOut:
    return await BattleService(db).ready(user, battle_id)


@router.post("/{battle_id}/leave", response_model=BattleRoomOut, summary="Покинуть битву")
async def leave_battle(
    battle_id: UUID,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> BattleRoomOut:
    return await BattleService(db).leave(user, battle_id)


@router.post("/{battle_id}/answers", response_model=BattleAnswerOut, summary="Отправить ответ")
async def answer_battle(
    battle_id: UUID,
    body: BattleAnswerIn,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> BattleAnswerOut:
    return await BattleService(db).answer(user, battle_id, body)


@router.get(
    "/{battle_id}/result", response_model=BattleResultOut, summary="Итог и свой разбор битвы"
)
async def battle_result(
    battle_id: UUID,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> BattleResultOut:
    return await BattleService(db).result(user, battle_id)


@router.post(
    "/{battle_id}/rematch",
    response_model=BattleCreateOut,
    status_code=status.HTTP_201_CREATED,
    summary="Создать реванш",
)
async def rematch_battle(
    battle_id: UUID,
    body: BattleRematch,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> BattleCreateOut:
    return await BattleService(db).rematch(user, battle_id, body.request_key)
