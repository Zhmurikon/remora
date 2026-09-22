"""Извлечение изображений теории — контракт с клиентом.

Тест читает тот же файл кейсов, что и packages/ui/src/components/article-media.test.ts:
сервер обязан находить ровно те изображения, что отрендерит клиентский markdown-it.
"""

import json
from pathlib import Path
from uuid import UUID

import pytest

from app.core.article_media import extract_media_ids

CASES_PATH = (
    Path(__file__).resolve().parents[3]
    / "packages"
    / "core"
    / "src"
    / "article-media-cases.json"
)
CASES = json.loads(CASES_PATH.read_text())["cases"]


def test_contract_file_is_shared_with_the_frontend() -> None:
    assert CASES_PATH.exists()


@pytest.mark.parametrize("case", CASES, ids=[case["name"] for case in CASES])
def test_article_media_contract(case: dict) -> None:
    assert extract_media_ids(case["body"]) == [UUID(value) for value in case["ids"]]
