"""Извлечение текста из пользовательских документов без исполнения содержимого."""

import asyncio
import io
import re
import zipfile
from pathlib import Path

from defusedxml import ElementTree
from pypdf import PdfReader

from app.core.errors import ValidationError

DOCUMENT_SUFFIXES = {".pdf", ".pptx", ".docx", ".txt", ".md"}
MAX_DOCUMENT_BYTES = 25 * 1024 * 1024
MAX_TEXT = 100_000


def extract_document(path: Path) -> str:
    if path.stat().st_size > MAX_DOCUMENT_BYTES:
        raise ValidationError("Документ должен быть не больше 25 МБ")
    suffix = path.suffix.lower()
    if suffix in {".txt", ".md"}:
        value = path.read_text(encoding="utf-8-sig")
    elif suffix == ".pdf":
        reader = PdfReader(io.BytesIO(path.read_bytes()), strict=False)
        if reader.is_encrypted:
            raise ValidationError("Снимите пароль с PDF перед загрузкой")
        if len(reader.pages) > 300:
            raise ValidationError("В PDF должно быть не больше 300 страниц")
        chunks: list[str] = []
        for page in reader.pages:
            chunks.append(page.extract_text() or "")
            if sum(map(len, chunks)) > MAX_TEXT:
                raise ValidationError("Документ слишком длинный: разделите его на части")
        value = "\n\n".join(chunks)
    else:
        with zipfile.ZipFile(path) as archive:
            files = archive.infolist()
            if len(files) > 5000 or sum(f.file_size for f in files) > 100 * 1024 * 1024:
                raise ValidationError("Слишком большой распакованный документ")
            names = [
                f.filename
                for f in files
                if (
                    re.fullmatch(r"ppt/slides/slide\d+\.xml", f.filename)
                    if suffix == ".pptx"
                    else f.filename == "word/document.xml"
                )
            ]
            names.sort(key=lambda name: int("".join(c for c in name if c.isdigit()) or "0"))
            chunks = []
            for name in names:
                root = ElementTree.fromstring(archive.read(name))
                paragraphs = [node for node in root.iter() if node.tag.endswith("}p")]
                if not paragraphs:
                    paragraphs = [root]
                chunks.append(
                    "\n".join(
                        "".join(
                            "".join(node.itertext())
                            for node in paragraph.iter()
                            if node.tag.endswith("}t")
                        )
                        for paragraph in paragraphs
                    )
                )
            value = "\n\n".join(chunks)
    value = value.replace("\x00", "").strip()
    if not value:
        raise ValidationError("В документе нет доступного текста. PDF-сканы пока не поддерживаются")
    if len(value) > MAX_TEXT:
        raise ValidationError("Документ слишком длинный: разделите его на части")
    return value


async def extract_document_async(path: Path) -> str:
    # Отдельный процесс ограничивает время разбора сложного PDF и не блокирует worker.
    process = await asyncio.create_subprocess_exec(
        "python",
        "-m",
        "app.services.assistant_documents",
        str(path),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=45)
    except TimeoutError:
        process.kill()
        await process.communicate()
        raise ValidationError("Документ слишком сложный для обработки") from None
    if process.returncode:
        raise ValidationError(
            stderr.decode("utf-8", errors="replace")[:300] or "Не удалось прочитать документ"
        )
    return stdout.decode("utf-8")


if __name__ == "__main__":
    import resource
    import sys

    resource.setrlimit(resource.RLIMIT_AS, (768 * 1024 * 1024, 768 * 1024 * 1024))
    resource.setrlimit(resource.RLIMIT_CPU, (40, 40))
    try:
        print(extract_document(Path(sys.argv[1])))
    except Exception as exc:  # noqa: BLE001 — дочерний процесс передаёт только безопасную ошибку
        print(
            exc.message if isinstance(exc, ValidationError) else "Не удалось прочитать документ",
            file=sys.stderr,
        )
        sys.exit(1)
