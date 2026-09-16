"""Скачивание пользовательских наборов в переносимых форматах."""

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import current_user
from app.db.session import get_db
from app.models.user import User
from app.services.content import ContentService
from app.services.exporting import render_anki_txt, render_csv, render_txt
from app.services.printing import PrintCard, render_cards

router = APIRouter(prefix="/sets", tags=["exports"])


@router.get("/{set_id}/export", summary="Экспортировать набор")
async def export_set(
    set_id: UUID,
    format: Literal["txt", "csv", "anki", "pdf"] = Query(),
    side_separator: str = Query(default="\t", max_length=10),
    card_separator: str = Query(default="\n", max_length=10),
    layout: Literal["double_sided", "foldable"] = "double_sided",
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    study_set = await ContentService(db).get_owned_set(user, set_id, with_cards=True)
    filename = f"set-{set_id}"
    if format == "pdf":
        payload = render_cards(
            title=study_set.title,
            cards=[
                PrintCard(term=card.term, definition=card.definition) for card in study_set.cards
            ],
            layout=layout,
        )
        return _download(payload, "application/pdf", f"{filename}.pdf")
    if format == "csv":
        return _download(render_csv(study_set.cards), "text/csv; charset=utf-8", f"{filename}.csv")
    if format == "anki":
        return _download(
            render_anki_txt(study_set.cards), "text/plain; charset=utf-8", f"{filename}-anki.txt"
        )
    return _download(
        render_txt(
            study_set.cards,
            side_separator=side_separator,
            card_separator=card_separator,
        ),
        "text/plain; charset=utf-8",
        f"{filename}.txt",
    )


def _download(payload: bytes, media_type: str, filename: str) -> Response:
    return Response(
        content=payload,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
