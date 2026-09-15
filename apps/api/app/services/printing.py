"""Печатные материалы: тест, лист ответов, карточки для вырезания, список терминов.

Для преподавателя печать — неожиданно весомый аргумент: раздать тест на бумаге
проще, чем усадить класс за телефоны. Поэтому документы должны быть готовы к
печати без правок: поля под дырокол, отметки реза, ничего лишнего.

Шрифт ищется среди системных: в PDF кириллица работает только со встроенным
TTF, а тащить шрифт в репозиторий ради этого не хочется. Образ API в E11
обязан содержать `fonts-dejavu-core` — иначе печать ответит понятной ошибкой,
а не кракозябрами.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from functools import lru_cache
from io import BytesIO
from pathlib import Path

from fastapi import status
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas

from app.core.errors import AppError

FONT_REGULAR = "RemoraPrint"
FONT_BOLD = "RemoraPrint-Bold"

# Порядок важен: DejaVu покрывает кириллицу полностью, остальные — запасные.
FONT_CANDIDATES: tuple[tuple[str, str], ...] = (
    (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ),
    (
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    ),
    (
        "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf",
        "/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf",
    ),
)

PAGE_WIDTH, PAGE_HEIGHT = A4
MARGIN = 18 * mm


class PrintUnavailableError(AppError):
    """В системе нет шрифта с кириллицей — печатать нечем."""

    code = "PRINT_UNAVAILABLE"
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    message = "Печать недоступна: на сервере не установлен шрифт с кириллицей"


@dataclass(frozen=True, slots=True)
class PrintCard:
    term: str
    definition: str


@lru_cache
def ensure_fonts() -> None:
    """Регистрирует первый найденный шрифт. Вызывается один раз за процесс."""
    for regular, bold in FONT_CANDIDATES:
        if Path(regular).exists() and Path(bold).exists():
            pdfmetrics.registerFont(TTFont(FONT_REGULAR, regular))
            pdfmetrics.registerFont(TTFont(FONT_BOLD, bold))
            return
    raise PrintUnavailableError()


def render_test(
    *,
    title: str,
    questions: Sequence[dict[str, object]],
    with_answers: bool,
) -> bytes:
    """Тест на печать. `with_answers` — тот же документ, но с ключом для проверки."""
    ensure_fonts()
    buffer = BytesIO()
    canvas = Canvas(buffer, pagesize=A4)
    canvas.setTitle(f"{title} — {'ключ' if with_answers else 'тест'}")

    cursor = _header(
        canvas,
        title,
        "Лист ответов преподавателя" if with_answers else "Тест",
        show_name_field=not with_answers,
    )

    for number, question in enumerate(questions, start=1):
        block = _question_lines(number, question, with_answers=with_answers)
        needed = sum(_line_height(line) for line in block) + 4 * mm
        if cursor - needed < MARGIN:
            canvas.showPage()
            cursor = _header(canvas, title, "продолжение", show_name_field=False)
        for line in block:
            cursor = _draw_line(canvas, line, cursor)
        cursor -= 4 * mm

    canvas.save()
    return buffer.getvalue()


def render_terms(*, title: str, cards: Sequence[PrintCard]) -> bytes:
    """Список терминов в две колонки — раздаточный материал для повторения."""
    ensure_fonts()
    buffer = BytesIO()
    canvas = Canvas(buffer, pagesize=A4)
    canvas.setTitle(f"{title} — термины")

    cursor = _header(canvas, title, f"Список терминов · {len(cards)} шт.", show_name_field=False)
    column_width = (PAGE_WIDTH - 2 * MARGIN) / 2 - 6 * mm

    for index, card in enumerate(cards, start=1):
        term_lines = _wrap(card.term, FONT_BOLD, 10, column_width)
        definition_lines = _wrap(card.definition, FONT_REGULAR, 10, column_width)
        needed = max(len(term_lines), len(definition_lines)) * 5 * mm + 3 * mm
        if cursor - needed < MARGIN:
            canvas.showPage()
            cursor = _header(canvas, title, "продолжение", show_name_field=False)

        top = cursor
        canvas.setFont(FONT_BOLD, 10)
        for offset, line in enumerate(term_lines):
            numbered = f"{index}. {line}" if offset == 0 else line
            canvas.drawString(MARGIN, top - offset * 5 * mm, numbered)
        canvas.setFont(FONT_REGULAR, 10)
        for offset, line in enumerate(definition_lines):
            canvas.drawString(MARGIN + column_width + 12 * mm, top - offset * 5 * mm, line)
        cursor = top - needed

    canvas.save()
    return buffer.getvalue()


def render_cards(*, title: str, cards: Sequence[PrintCard], layout: str) -> bytes:
    """Карточки для вырезания.

    `double_sided` — термины на лицевой стороне, определения на обороте с
    зеркальным порядком колонок: только так двусторонняя печать совпадает.
    `foldable` — термин и определение в одной ячейке, разделённые линией сгиба.
    """
    ensure_fonts()
    buffer = BytesIO()
    canvas = Canvas(buffer, pagesize=A4)
    canvas.setTitle(f"{title} — карточки")

    columns, rows = 2, 5
    per_page = columns * rows
    cell_width = (PAGE_WIDTH - 2 * MARGIN) / columns
    cell_height = (PAGE_HEIGHT - 2 * MARGIN) / rows

    for start in range(0, len(cards), per_page):
        chunk = list(cards[start : start + per_page])
        if layout == "double_sided":
            _draw_cut_grid(canvas, columns, rows, cell_width, cell_height)
            for position, card in enumerate(chunk):
                _draw_cell_text(
                    canvas, position, columns, cell_width, cell_height, card.term, bold=True
                )
            canvas.showPage()

            _draw_cut_grid(canvas, columns, rows, cell_width, cell_height)
            for position, card in enumerate(chunk):
                # Зеркалим колонку, чтобы оборот совпал с лицом при печати.
                row, column = divmod(position, columns)
                mirrored = row * columns + (columns - 1 - column)
                _draw_cell_text(
                    canvas, mirrored, columns, cell_width, cell_height, card.definition
                )
            canvas.showPage()
        else:
            _draw_cut_grid(canvas, columns, rows, cell_width, cell_height)
            for position, card in enumerate(chunk):
                _draw_foldable_cell(canvas, position, columns, cell_width, cell_height, card)
            canvas.showPage()

    if not cards:
        canvas.showPage()
    canvas.save()
    return buffer.getvalue()


# ------------------------------------------------------------------- рисование


@dataclass(frozen=True, slots=True)
class _Line:
    text: str
    font: str = FONT_REGULAR
    size: float = 11
    indent: float = 0
    gap: float = 5.5 * mm


def _line_height(line: _Line) -> float:
    return line.gap


def _draw_line(canvas: Canvas, line: _Line, cursor: float) -> float:
    canvas.setFont(line.font, line.size)
    canvas.drawString(MARGIN + line.indent, cursor, line.text)
    return cursor - line.gap


def _header(canvas: Canvas, title: str, subtitle: str, *, show_name_field: bool) -> float:
    canvas.setFont(FONT_BOLD, 15)
    canvas.drawString(MARGIN, PAGE_HEIGHT - MARGIN, title[:70])
    canvas.setFont(FONT_REGULAR, 10)
    canvas.drawString(MARGIN, PAGE_HEIGHT - MARGIN - 6 * mm, subtitle)
    cursor = PAGE_HEIGHT - MARGIN - 12 * mm

    if show_name_field:
        canvas.setFont(FONT_REGULAR, 10)
        canvas.drawString(MARGIN, cursor, "Имя: ______________________    Дата: ____________")
        cursor -= 8 * mm

    canvas.setLineWidth(0.5)
    canvas.line(MARGIN, cursor, PAGE_WIDTH - MARGIN, cursor)
    return cursor - 8 * mm


def _question_lines(
    number: int, question: dict[str, object], *, with_answers: bool
) -> list[_Line]:
    kind = str(question.get("kind"))
    prompt = str(question.get("prompt", ""))
    width = PAGE_WIDTH - 2 * MARGIN - 8 * mm
    lines: list[_Line] = []

    if kind == "matching":
        lines.append(_Line(f"{number}. Сопоставьте пары", font=FONT_BOLD))
        pairs = [str(item) for item in _as_list(question.get("pairs"))]
        options = [str(item) for item in _as_list(question.get("options"))]
        for index, left in enumerate(pairs, start=1):
            lines.append(_Line(f"{index}) {left} — ______", indent=6 * mm, size=10))
        lines.append(_Line("Варианты: " + "; ".join(options), indent=6 * mm, size=9))
    else:
        for offset, chunk in enumerate(_wrap(prompt, FONT_BOLD, 11, width)):
            lines.append(_Line(f"{number}. {chunk}" if offset == 0 else chunk, font=FONT_BOLD))

    if kind == "choice":
        for index, option in enumerate(_as_list(question.get("options"))):
            marker = chr(ord("а") + index)
            lines.append(_Line(f"{marker}) {option}", indent=6 * mm, size=10))
    elif kind == "true_false":
        lines.append(_Line(f"Утверждение: {question.get('statement', '')}", indent=6 * mm, size=10))
        lines.append(_Line("верно  /  неверно", indent=6 * mm, size=10))
    elif kind == "typing" and not with_answers:
        # В ключе линейка для ответа не нужна: ниже и так напечатан сам ответ.
        lines.append(_Line("Ответ: " + "_" * 48, indent=6 * mm, size=10))

    if with_answers:
        lines.append(
            _Line(
                f"Ответ: {_expected_text(question)}",
                font=FONT_BOLD,
                indent=6 * mm,
                size=10,
            )
        )
    return lines


def _expected_text(question: dict[str, object]) -> str:
    values = question.get("answer_values")
    if isinstance(values, list) and values:
        return "; ".join(str(item) for item in values)
    if str(question.get("kind")) == "true_false":
        return "верно" if str(question.get("answer")) == "true" else "неверно"
    return str(question.get("answer", ""))


def _draw_cut_grid(
    canvas: Canvas, columns: int, rows: int, cell_width: float, cell_height: float
) -> None:
    canvas.setDash(2, 3)
    canvas.setLineWidth(0.4)
    for column in range(columns + 1):
        x = MARGIN + column * cell_width
        canvas.line(x, MARGIN, x, PAGE_HEIGHT - MARGIN)
    for row in range(rows + 1):
        y = MARGIN + row * cell_height
        canvas.line(MARGIN, y, PAGE_WIDTH - MARGIN, y)
    canvas.setDash()


def _cell_origin(
    position: int, columns: int, cell_width: float, cell_height: float
) -> tuple[float, float]:
    row, column = divmod(position, columns)
    left = MARGIN + column * cell_width
    top = PAGE_HEIGHT - MARGIN - row * cell_height
    return left, top


def _draw_cell_text(
    canvas: Canvas,
    position: int,
    columns: int,
    cell_width: float,
    cell_height: float,
    text: str,
    *,
    bold: bool = False,
) -> None:
    left, top = _cell_origin(position, columns, cell_width, cell_height)
    font = FONT_BOLD if bold else FONT_REGULAR
    lines = _wrap(text, font, 12, cell_width - 12 * mm)[:4]
    canvas.setFont(font, 12)
    start = top - cell_height / 2 + (len(lines) - 1) * 3 * mm
    for offset, line in enumerate(lines):
        canvas.drawCentredString(left + cell_width / 2, start - offset * 6 * mm, line)


def _draw_foldable_cell(
    canvas: Canvas,
    position: int,
    columns: int,
    cell_width: float,
    cell_height: float,
    card: PrintCard,
) -> None:
    left, top = _cell_origin(position, columns, cell_width, cell_height)
    middle = top - cell_height / 2

    canvas.setDash(1, 2)
    canvas.setLineWidth(0.3)
    canvas.line(left + 4 * mm, middle, left + cell_width - 4 * mm, middle)
    canvas.setDash()

    canvas.setFont(FONT_BOLD, 11)
    for offset, line in enumerate(_wrap(card.term, FONT_BOLD, 11, cell_width - 12 * mm)[:2]):
        canvas.drawCentredString(left + cell_width / 2, middle + 8 * mm - offset * 5 * mm, line)
    canvas.setFont(FONT_REGULAR, 10)
    for offset, line in enumerate(
        _wrap(card.definition, FONT_REGULAR, 10, cell_width - 12 * mm)[:3]
    ):
        canvas.drawCentredString(left + cell_width / 2, middle - 7 * mm - offset * 5 * mm, line)


def _as_list(value: object) -> list[object]:
    return list(value) if isinstance(value, list) else []


def _wrap(text: str, font: str, size: float, width: float) -> list[str]:
    """Переносит текст по словам под заданную ширину."""
    words = " ".join(str(text).split()).split(" ")
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if current and float(pdfmetrics.stringWidth(candidate, font, size)) > width:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines or [""]


def to_print_cards(rows: Iterable[tuple[str, str]]) -> list[PrintCard]:
    return [PrintCard(term=term, definition=definition) for term, definition in rows]
