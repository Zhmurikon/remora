"""Горизонтальный доступ: чужие UUID не дают читать или менять личные ресурсы."""

from unittest.mock import AsyncMock, patch

from httpx import AsyncClient

from tests.test_courses import auth


class UploadStorage:
    def upload_url(self, key: str, mime: str, ttl: int) -> str:
        return f"https://storage.test/{key}"


async def test_foreign_id_matrix(client: AsyncClient) -> None:
    owner = await auth(client, "matrix-owner")
    stranger = await auth(client, "matrix-stranger")
    folder = (await client.post("/api/v1/folders", headers=owner, json={"title": "Личное"})).json()
    study_set = (
        await client.post("/api/v1/sets", headers=owner, json={"title": "Материал"})
    ).json()
    saved = await client.put(
        f"/api/v1/sets/{study_set['id']}/cards",
        headers=owner,
        json={
            "cards": [
                {"term": f"Термин {index}", "definition": f"Ответ {index}"} for index in range(5)
            ]
        },
    )
    course = (
        await client.post(
            "/api/v1/courses",
            headers=owner,
            json={"title": "Личный курс", "set_id": study_set["id"]},
        )
    ).json()
    attempt = (
        await client.post(
            f"/api/v1/study/sets/{study_set['id']}/tests",
            headers=owner,
            json={"question_count": 3, "kinds": ["typing"]},
        )
    ).json()
    token = (
        await client.post(
            "/api/v1/users/me/api-tokens",
            headers=owner,
            json={"name": "Владелец", "expires_in_days": 30, "scopes": ["materials:read"]},
        )
    ).json()
    with patch("app.services.media.get_object_storage", return_value=UploadStorage()):
        asset = (
            await client.post(
                "/api/v1/media/upload-url",
                headers=owner,
                json={"filename": "private.png", "mime": "image/png", "size_bytes": 10},
            )
        ).json()
    with patch("app.api.v1.users.enqueue_account_export", new_callable=AsyncMock):
        export = (await client.post("/api/v1/users/me/export", headers=owner)).json()

    checks = [
        await client.patch(
            f"/api/v1/folders/{folder['id']}", headers=stranger, json={"title": "Захват"}
        ),
        await client.get(f"/api/v1/sets/{study_set['id']}", headers=stranger),
        await client.put(
            f"/api/v1/sets/{study_set['id']}/cards",
            headers=stranger,
            json={"cards": saved.json()["cards"]},
        ),
        await client.get(f"/api/v1/courses/{course['id']}", headers=stranger),
        await client.get(f"/api/v1/courses/{course['id']}/editor", headers=stranger),
        await client.get(f"/api/v1/media/{asset['id']}", headers=stranger),
        await client.get(f"/api/v1/study/tests/{attempt['id']}", headers=stranger),
        await client.delete(f"/api/v1/users/me/api-tokens/{token['id']}", headers=stranger),
        await client.get(f"/api/v1/users/me/export/{export['id']}", headers=stranger),
    ]
    assert all(response.status_code in {403, 404} for response in checks), [
        (response.status_code, response.text) for response in checks
    ]
