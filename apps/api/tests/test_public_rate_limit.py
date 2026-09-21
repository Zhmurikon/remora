"""Лимит публичного чтения применяется к прямым обращениям, но не к рендеру страниц.

Публичные страницы рендерит Next и ходит в API по внутренней сети, поэтому у таких
запросов нет адреса посетителя. Считать их одним клиентом нельзя — задушили бы весь сайт.
"""

from httpx import ASGITransport, AsyncClient

from app.api.v1.deps import _is_internal
from app.core.config import get_settings
from app.main import create_app
from tests.test_courses import auth


def external_client() -> AsyncClient:
    """Запрос «снаружи»: uvicorn подставляет реальный адрес из X-Forwarded-For."""
    transport = ASGITransport(app=create_app(), client=("93.184.216.34", 44321))
    return AsyncClient(transport=transport, base_url="http://test")


def test_internal_callers_are_exempt() -> None:
    # Контейнер web, локальная разработка и отсутствующий адрес — всё это не парсер.
    assert _is_internal("172.18.0.5") is True
    assert _is_internal("127.0.0.1") is True
    assert _is_internal("10.1.2.3") is True
    assert _is_internal(None) is True
    assert _is_internal("testclient") is True
    assert _is_internal("93.184.216.34") is False
    # Документационные и зарезервированные диапазоны ipaddress тоже считает приватными.
    assert _is_internal("203.0.113.7") is True


async def test_public_read_is_limited_only_from_outside(client: AsyncClient) -> None:
    owner = await auth(client, "ratelimit")
    study_set = (await client.post("/api/v1/sets", headers=owner, json={"title": "Каталог"})).json()
    await client.put(
        f"/api/v1/sets/{study_set['id']}/cards",
        headers=owner,
        json={"cards": [{"term": "A", "definition": "B"}]},
    )
    course = (
        await client.post(
            "/api/v1/courses", headers=owner, json={"title": "Курс", "set_id": study_set["id"]}
        )
    ).json()
    await client.post(f"/api/v1/courses/{course['id']}/publish", headers=owner, json={})
    path = f"/api/v1/courses/public/{course['slug']}"
    limit = get_settings().rate_limit_public_read

    # Внутренний вызов (как из контейнера web) не тратит окно и не упирается в лимит.
    for _ in range(limit + 5):
        assert (await client.get(path)).status_code == 200

    async with external_client() as outside:
        codes = [(await outside.get(path)).status_code for _ in range(limit + 1)]
    assert codes[:limit] == [200] * limit
    assert codes[-1] == 429

    body = None
    async with external_client() as outside:
        body = (await outside.get(path)).json()
    assert body["code"] == "RATE_LIMITED"
    assert body["details"]["scope"] == "public-read"
    # Страница по-прежнему открыта изнутри: лимит не задел рендер сайта.
    assert (await client.get(path)).status_code == 200
