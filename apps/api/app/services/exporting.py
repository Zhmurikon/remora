"""Текстовые форматы экспорта пользовательского набора."""

import csv
from collections.abc import Sequence
from io import StringIO

from app.core.errors import ConflictError
from app.models.content import Card


def render_txt(cards: Sequence[Card], *, side_separator: str, card_separator: str) -> bytes:
    """Обычный TXT с выбранными пользователем разделителями."""
    _validate_separator(side_separator, "между сторонами")
    _validate_separator(card_separator, "между карточками")
    if side_separator == card_separator:
        raise ConflictError("Разделители сторон и карточек должны отличаться")
    rows = [
        side_separator.join(
            (
                _quote_txt(card.term, side_separator, card_separator),
                _quote_txt(card.definition, side_separator, card_separator),
            )
        )
        for card in cards
    ]
    return card_separator.join(rows).encode("utf-8")


def render_csv(cards: Sequence[Card]) -> bytes:
    """CSV с BOM: такой файл Excel открывает с кириллицей без ручного выбора кодировки."""
    output = StringIO(newline="")
    writer = csv.writer(output, lineterminator="\r\n")
    writer.writerow(("Термин", "Определение"))
    writer.writerows((card.term, card.definition) for card in cards)
    return output.getvalue().encode("utf-8-sig")


def render_anki_txt(cards: Sequence[Card]) -> bytes:
    """Anki TXT с директивами и экранированием переносов строк через HTML."""
    lines = ["#separator:tab", "#html:true", "#columns:Front\tBack"]
    lines.extend(f"{_anki_field(card.term)}\t{_anki_field(card.definition)}" for card in cards)
    return ("\n".join(lines) + "\n").encode("utf-8")


def _anki_field(value: str) -> str:
    # Anki читает каждую заметку из одной строки, поэтому реальные переносы заменяем на <br>.
    return (
        value.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\t", "&#9;")
        .replace("\r\n", "\n")
        .replace("\r", "\n")
        .replace("\n", "<br>")
    )


def _quote_txt(value: str, side_separator: str, card_separator: str) -> str:
    if '"' in value or side_separator in value or card_separator in value:
        return f'"{value.replace(chr(34), chr(34) * 2)}"'
    return value


def _validate_separator(value: str, label: str) -> None:
    if not value:
        raise ConflictError(f"Укажите разделитель {label}")
    if len(value) > 10:
        raise ConflictError("Разделитель не может быть длиннее 10 символов")
