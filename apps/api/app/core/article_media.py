"""Ссылки на изображения в теории. Контракт совпадает с клиентским ArticleContent:
изображение адресуется только протоколом media: с валидным UUID, код картинок не даёт.
"""

import re
from uuid import UUID

# Строгий UUID — тот же формат, что в packages/ui/src/components/article-markdown.ts.
_UUID = r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
# Markdown-изображение ![alt](media:UUID) с пробелами, угловыми скобками и title.
_IMAGE = re.compile(rf"!\[[^\]]*\]\(\s*<?\s*media:({_UUID})\s*>?(?:\s+[^)]*)?\)", re.IGNORECASE)
# Код не рендерит изображений, поэтому вырезаем блоки и строчный код до поиска (как markdown-it).
_FENCED = re.compile(r"```.*?```|~~~.*?~~~", re.DOTALL)
_INLINE_CODE = re.compile(r"`[^`\n]*`")


def extract_media_ids(body: str) -> list[UUID]:
    """UUID изображений теории в порядке появления, без повторов."""
    stripped = _INLINE_CODE.sub(" ", _FENCED.sub(" ", body or ""))
    result: list[UUID] = []
    seen: set[UUID] = set()
    for match in _IMAGE.finditer(stripped):
        identifier = UUID(match.group(1).lower())
        if identifier not in seen:
            seen.add(identifier)
            result.append(identifier)
    return result
