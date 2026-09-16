"""Серверный транспорт Meilisearch; ключ не передаётся публичным клиентам."""

import asyncio
from typing import Any

import httpx

from app.core.config import Settings


class SearchTaskError(RuntimeError):
    """Meilisearch принял запись, но не смог применить её."""


class SearchIndex:
    def __init__(self, client: httpx.AsyncClient, index: str) -> None:
        self.client = client
        self.path = f"/indexes/{index}"

    @staticmethod
    def client_for(settings: Settings) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            base_url=settings.meili_url,
            headers={"Authorization": f"Bearer {settings.meili_master_key.get_secret_value()}"},
            timeout=settings.meili_timeout_seconds,
        )

    async def _write(self, method: str, path: str, payload: Any = None) -> None:
        response = await self.client.request(method, path, json=payload)
        response.raise_for_status()
        task_id = int(response.json()["taskUid"])
        # HTTP 202 означает только очередь: нельзя подтверждать синхронизацию раньше задачи.
        async with asyncio.timeout(60):
            while True:
                task = await self.client.get(f"/tasks/{task_id}")
                task.raise_for_status()
                status = task.json()["status"]
                if status == "succeeded":
                    return
                if status in {"failed", "canceled"}:
                    # Ответ провайдера может содержать контент; не включаем его в исключение.
                    raise SearchTaskError(f"Search task {task_id}: {status}")
                await asyncio.sleep(0.1)

    async def configure(self) -> None:
        await self._write(
            "PATCH",
            f"{self.path}/settings",
            {
                "searchableAttributes": ["title", "tags", "description", "content", "author"],
                "displayedAttributes": ["id"],
                "filterableAttributes": [
                    "tags",
                    "languages",
                    "author_id",
                    "cards_count",
                    "updated_at",
                ],
                "sortableAttributes": ["updated_at", "cards_count"],
            },
        )

    async def replace(self, documents: list[dict[str, Any]]) -> None:
        if documents:
            await self._write("POST", f"{self.path}/documents?primaryKey=id", documents)

    async def delete(self, ids: list[str]) -> None:
        if ids:
            await self._write("POST", f"{self.path}/documents/delete-batch", ids)

    async def search(self, query: dict[str, Any]) -> list[str]:
        # Метаданные и права будут повторно прочитаны из PostgreSQL, не из устаревшего индекса.
        response = await self.client.post(
            f"{self.path}/search", json={**query, "attributesToRetrieve": ["id"]}
        )
        response.raise_for_status()
        return [str(hit["id"]) for hit in response.json()["hits"]]

    async def document_ids(self) -> set[str]:
        ids: set[str] = set()
        offset = 0
        while True:
            response = await self.client.get(
                f"{self.path}/documents",
                params={"fields": "id", "limit": 1000, "offset": offset},
            )
            response.raise_for_status()
            page = response.json()["results"]
            ids.update(str(item["id"]) for item in page)
            if len(page) < 1000:
                return ids
            offset += len(page)
