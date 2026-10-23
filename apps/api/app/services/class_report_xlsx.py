"""Минимальный XLSX-экспорт сводки класса без промежуточных файлов."""

# ruff: noqa: E501 — MIME-типы и XML-пространства имён нельзя безопасно переносить.

from __future__ import annotations

from io import BytesIO
from xml.sax.saxutils import escape
from zipfile import ZIP_DEFLATED, ZipFile

from app.schemas.classes import ClassReportOut


def build_class_report_xlsx(report: ClassReportOut, class_title: str) -> bytes:
    rows: list[list[str | int]] = [
        ["Отчёт класса", class_title],
        ["Сформирован", report.generated_at.strftime("%d.%m.%Y %H:%M UTC")],
        [],
        ["Ученик", "Логин", *[assignment.title for assignment in report.assignments]],
    ]
    for student in report.students:
        rows.append(
            [
                student.display_name or student.username,
                student.username,
                *[
                    _progress_label(
                        student.assignments[assignment.id].progress_value,
                        assignment.goal_value,
                        student.assignments[assignment.id].status.value,
                    )
                    for assignment in report.assignments
                ],
            ]
        )

    sheet = _worksheet(rows, freeze_row=4)
    output = BytesIO()
    with ZipFile(output, "w", ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", _CONTENT_TYPES)
        archive.writestr("_rels/.rels", _ROOT_RELS)
        archive.writestr("xl/workbook.xml", _WORKBOOK)
        archive.writestr("xl/_rels/workbook.xml.rels", _WORKBOOK_RELS)
        archive.writestr("xl/styles.xml", _STYLES)
        archive.writestr("xl/worksheets/sheet1.xml", sheet)
        archive.writestr("docProps/core.xml", _CORE_PROPERTIES)
        archive.writestr("docProps/app.xml", _APP_PROPERTIES)
    return output.getvalue()


def _progress_label(value: int, goal: int, status: str) -> str:
    labels = {
        "not_started": "Не начато",
        "in_progress": "В работе",
        "done": "Выполнено",
        "late": "Просрочено",
    }
    return f"{value} из {goal} · {labels[status]}"


def _worksheet(rows: list[list[str | int]], *, freeze_row: int) -> str:
    max_columns = max((len(row) for row in rows), default=1)
    columns = [22, 18, *([24] * max(0, max_columns - 2))]
    row_xml: list[str] = []
    for row_index, row in enumerate(rows, start=1):
        cells = []
        for column_index, value in enumerate(row, start=1):
            reference = f"{_column_name(column_index)}{row_index}"
            style = 1 if row_index == 4 else (2 if row_index == 1 else 0)
            if isinstance(value, int):
                cells.append(f'<c r="{reference}" s="{style}"><v>{value}</v></c>')
            else:
                escaped = escape(value)
                cells.append(
                    f'<c r="{reference}" s="{style}" t="inlineStr"><is><t>{escaped}</t></is></c>'
                )
        row_xml.append(f'<row r="{row_index}">{"".join(cells)}</row>')
    column_xml = "".join(
        f'<col min="{index}" max="{index}" width="{width}" customWidth="1"/>'
        for index, width in enumerate(columns, start=1)
    )
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f'<sheetViews><sheetView workbookViewId="0"><pane ySplit="{freeze_row}" '
        f'topLeftCell="A{freeze_row + 1}" activePane="bottomLeft" state="frozen"/>'
        '</sheetView></sheetViews>'
        f"<cols>{column_xml}</cols><sheetData>{''.join(row_xml)}</sheetData>"
        '<autoFilter ref="A4:'
        f'{_column_name(max_columns)}{max(4, len(rows))}"/>'
        '</worksheet>'
    )


def _column_name(index: int) -> str:
    result = ""
    while index:
        index, remainder = divmod(index - 1, 26)
        result = chr(65 + remainder) + result
    return result


_CONTENT_TYPES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>"""

_ROOT_RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>"""

_WORKBOOK = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Успеваемость" sheetId="1" r:id="rId1"/></sheets>
</workbook>"""

_WORKBOOK_RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>"""

_STYLES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="3"><font><sz val="11"/><name val="Arial"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Arial"/></font><font><b/><sz val="16"/><name val="Arial"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0E7A77"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border/><border><left style="thin"><color rgb="FFD9E4E2"/></left><right style="thin"><color rgb="FFD9E4E2"/></right><top style="thin"><color rgb="FFD9E4E2"/></top><bottom style="thin"><color rgb="FFD9E4E2"/></bottom></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>"""

_CORE_PROPERTIES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Отчёт класса Запоминальни</dc:title><dc:creator>Запоминальня</dc:creator></cp:coreProperties>"""

_APP_PROPERTIES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Запоминальня</Application></Properties>"""
