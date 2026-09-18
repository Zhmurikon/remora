"""Печатные материалы: PDF теста, ключа, карточек для вырезания и списка терминов."""

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import current_user
from app.db.session import get_db
from app.models.user import User
from app.services.content import ContentService
from app.services.printing import PrintCard, render_cards, render_terms, render_test
from app.services.test_mode import TestModeService

router = APIRouter(prefix="/print", tags=["print"])


def _pdf(payload: bytes, filename: str) -> Response:
    return Response(
        content=payload,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@router.get("/tests/{attempt_id}", summary="Тест на печать")
async def print_test(
    attempt_id: UUID,
    answers: bool = Query(default=False, description="Печатать ключ вместо бланка"),
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    service = TestModeService(db)
    attempt = await service.get_raw_attempt(user, attempt_id)
    study_set = await ContentService(db).get_study_set(user, attempt.set_id)
    payload = render_test(
        title=study_set.title,
        questions=attempt.questions,
        with_answers=answers,
    )
    suffix = "answers" if answers else "test"
    return _pdf(payload, f"{suffix}-{attempt_id}.pdf")


@router.get("/sets/{set_id}/cards", summary="Карточки для вырезания")
async def print_cards(
    set_id: UUID,
    layout: Literal["double_sided", "foldable"] = "double_sided",
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    study_set = await ContentService(db).get_study_set(user, set_id, with_cards=True)
    payload = render_cards(
        title=study_set.title,
        cards=[PrintCard(term=card.term, definition=card.definition) for card in study_set.cards],
        layout=layout,
    )
    return _pdf(payload, f"cards-{set_id}.pdf")


@router.get("/sets/{set_id}/terms", summary="Список терминов")
async def print_terms(
    set_id: UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> Response:
    study_set = await ContentService(db).get_study_set(user, set_id, with_cards=True)
    payload = render_terms(
        title=study_set.title,
        cards=[PrintCard(term=card.term, definition=card.definition) for card in study_set.cards],
    )
    return _pdf(payload, f"terms-{set_id}.pdf")
