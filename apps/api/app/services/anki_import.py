"""Безопасный разбор Anki TXT и APKG в двухсторонние карточки Remora."""

import html
import json
import re
import sqlite3
import tempfile
import zipfile
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path, PurePosixPath

from app.core.errors import ConflictError

FIELD_SEPARATOR = "\x1f"
MAX_CARDS = 1_000
MAX_ARCHIVE_FILES = 10_000
MAX_UNPACKED_BYTES = 500 * 1024 * 1024
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
SOUND_RE = re.compile(r"\[sound:([^\]]+)]", re.IGNORECASE)
IMAGE_RE = re.compile(r"<img\b[^>]*?\bsrc=[\"']([^\"']+)[\"'][^>]*>", re.IGNORECASE)
BR_RE = re.compile(r"<br\s*/?>", re.IGNORECASE)
TAG_RE = re.compile(r"<[^>]+>")
CLOZE_RE = re.compile(r"{{c\d+::(.*?)(?:::[^{}]*?)?}}", re.IGNORECASE | re.DOTALL)


@dataclass(slots=True)
class AnkiCard:
    term: str
    definition: str
    term_image: str | None = None
    definition_image: str | None = None


@dataclass(slots=True)
class ParsedAnki:
    cards: list[AnkiCard]
    media: dict[str, bytes]
    skipped_notes: int = 0
    skipped_media: int = 0
    warnings: list[str] | None = None
    errors: list[dict[str, object]] | None = None

    def __post_init__(self) -> None:
        if self.warnings is None:
            self.warnings = []
        if self.errors is None:
            self.errors = []


def parse_anki(payload: bytes, filename: str) -> ParsedAnki:
    suffix = Path(filename).suffix.lower()
    if suffix == ".txt":
        return _parse_txt(payload)
    if suffix == ".apkg":
        return _parse_apkg(payload)
    raise ConflictError("Поддерживаются файлы Anki .apkg и .txt")


def _parse_txt(payload: bytes) -> ParsedAnki:
    try:
        source = payload.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ConflictError("TXT-файл должен быть сохранён в UTF-8") from exc

    separator = "\t"
    html_enabled = False
    cards: list[AnkiCard] = []
    skipped = 0
    errors: list[dict[str, object]] = []
    for row, line in enumerate(source.splitlines(), start=1):
        if line.startswith("#separator:"):
            value = line.partition(":")[2].strip().lower()
            separator = {"tab": "\t", "semicolon": ";", "comma": ","}.get(value, value)
            continue
        if line.startswith("#html:"):
            html_enabled = line.partition(":")[2].strip().lower() == "true"
            continue
        if not line or line.startswith("#"):
            continue
        fields = line.split(separator)
        if len(fields) < 2:
            skipped += 1
            errors.append({"row": row, "message": "Не найдено второе поле"})
            continue
        term = _clean_field(fields[0], html_enabled=html_enabled)
        definition = _clean_field(fields[1], html_enabled=html_enabled)
        if not term or not definition:
            skipped += 1
            errors.append({"row": row, "message": "Термин или определение пусты"})
            continue
        cards.append(AnkiCard(term=term, definition=definition))
        if len(cards) > MAX_CARDS:
            raise ConflictError("За один импорт можно добавить не больше 1000 карточек")
    return ParsedAnki(cards=cards, media={}, skipped_notes=skipped, errors=errors)


def _parse_apkg(payload: bytes) -> ParsedAnki:
    try:
        archive = zipfile.ZipFile(BytesIO(payload))
    except (zipfile.BadZipFile, OSError) as exc:
        raise ConflictError("Файл APKG повреждён или имеет неверный формат") from exc

    with archive:
        infos = archive.infolist()
        if (
            len(infos) > MAX_ARCHIVE_FILES
            or sum(item.file_size for item in infos) > MAX_UNPACKED_BYTES
        ):
            raise ConflictError("Архив Anki слишком большой")
        collection_name = next(
            (
                name
                for name in ("collection.anki2", "collection.anki21")
                if name in archive.namelist()
            ),
            None,
        )
        if collection_name is None:
            raise ConflictError("В APKG не найдена коллекция Anki")
        collection = archive.read(collection_name)
        cards, skipped_notes, errors = _read_collection(collection)
        media_map = _read_media_map(archive)
        referenced = {
            name
            for card in cards
            for name in (card.term_image, card.definition_image)
            if name is not None
        }
        media: dict[str, bytes] = {}
        skipped_media = 0
        for original_name in referenced:
            stored_name = media_map.get(original_name)
            if stored_name is None or stored_name not in archive.namelist():
                skipped_media += 1
                continue
            if PurePosixPath(original_name).suffix.lower() not in IMAGE_EXTENSIONS:
                skipped_media += 1
                continue
            media[original_name] = archive.read(stored_name)
        warnings: list[str] = []
        sound_count = sum(len(SOUND_RE.findall(value)) for value in _raw_note_fields(collection))
        if sound_count:
            warnings.append(f"Аудиовложений пропущено: {sound_count}")
        return ParsedAnki(
            cards=cards,
            media=media,
            skipped_notes=skipped_notes,
            skipped_media=skipped_media,
            warnings=warnings,
            errors=errors,
        )


def _read_collection(payload: bytes) -> tuple[list[AnkiCard], int, list[dict[str, object]]]:
    with tempfile.NamedTemporaryFile(suffix=".anki2") as database:
        database.write(payload)
        database.flush()
        try:
            connection = sqlite3.connect(f"file:{database.name}?mode=ro", uri=True)
            rows = connection.execute("SELECT flds FROM notes ORDER BY id").fetchall()
            connection.close()
        except sqlite3.DatabaseError as exc:
            raise ConflictError(
                "Эта версия APKG пока не поддерживается; экспортируйте колоду в старом формате Anki"
            ) from exc

    cards: list[AnkiCard] = []
    skipped = 0
    errors: list[dict[str, object]] = []
    for row, (raw_fields,) in enumerate(rows, start=1):
        fields = str(raw_fields).split(FIELD_SEPARATOR)
        if len(fields) < 2:
            skipped += 1
            errors.append({"row": row, "message": "У заметки меньше двух полей"})
            continue
        term_image = _first_image(fields[0])
        definition_image = _first_image(fields[1])
        term = _clean_field(fields[0], html_enabled=True)
        definition = _clean_field(fields[1], html_enabled=True)
        if not term or not definition:
            skipped += 1
            errors.append({"row": row, "message": "После очистки одна из сторон пуста"})
            continue
        cards.append(AnkiCard(term, definition, term_image, definition_image))
        if len(cards) > MAX_CARDS:
            raise ConflictError("За один импорт можно добавить не больше 1000 карточек")
    return cards, skipped, errors


def _raw_note_fields(payload: bytes) -> list[str]:
    with tempfile.NamedTemporaryFile(suffix=".anki2") as database:
        database.write(payload)
        database.flush()
        try:
            connection = sqlite3.connect(f"file:{database.name}?mode=ro", uri=True)
            rows = connection.execute("SELECT flds FROM notes").fetchall()
            connection.close()
        except sqlite3.DatabaseError:
            return []
    return [str(row[0]) for row in rows]


def _read_media_map(archive: zipfile.ZipFile) -> dict[str, str]:
    if "media" not in archive.namelist():
        return {}
    try:
        raw = json.loads(archive.read("media"))
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise ConflictError("В APKG повреждён индекс медиафайлов") from exc
    if not isinstance(raw, dict):
        raise ConflictError("В APKG неверный индекс медиафайлов")
    return {str(original): str(stored) for stored, original in raw.items()}


def _first_image(value: str) -> str | None:
    match = IMAGE_RE.search(value)
    return html.unescape(match.group(1)) if match else None


def _clean_field(value: str, *, html_enabled: bool) -> str:
    value = SOUND_RE.sub("", value)
    value = IMAGE_RE.sub("", value)
    value = CLOZE_RE.sub(r"\1", value)
    if html_enabled:
        value = BR_RE.sub("\n", value)
        value = TAG_RE.sub("", value)
    return html.unescape(value).strip()
