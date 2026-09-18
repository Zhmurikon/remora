"""Явная проверка дев-сервера: создаёт отдельный технический аккаунт и приватные данные."""

import io
import secrets
import time
from datetime import UTC, datetime
from uuid import uuid4

import httpx
from PIL import Image

BASE = "https://test.edu-remora.ru"


def main() -> None:
    username = "deploy_" + uuid4().hex[:12]
    password = secrets.token_urlsafe(30)
    with httpx.Client(base_url=BASE, timeout=45) as client:

        def request(method: str, path: str, **kwargs):
            response = client.request(method, "/api/v1" + path, **kwargs)
            assert response.is_success, (method, path, response.status_code)
            return response.json() if response.content else None

        auth = request(
            "POST",
            "/auth/register",
            json={
                "username": username,
                "email": username + "@example.com",
                "password": password,
            },
        )
        auth = request(
            "POST", "/auth/login", json={"email": username + "@example.com", "password": password}
        )
        client.headers["Authorization"] = "Bearer " + auth["access_token"]
        token = request("POST", "/users/me/api-tokens", json={"name": "Deployment smoke"})
        agent_headers = {
            "Authorization": "Bearer " + token["token"],
            "Idempotency-Key": str(uuid4()),
        }
        body = {
            "title": "Проверка серверной сборки",
            "cards": [
                {
                    "term": str(i),
                    "definition": f"Число {i}",
                    "wrong_definition_answers": ["Буква", "Знак", "Слово"],
                    "wrong_term_answers": ["А", "Б", "В"],
                }
                for i in range(1, 11)
            ],
        }
        material = request("POST", "/agent/sets", json=body, headers=agent_headers)
        repeat = request("POST", "/agent/sets", json=body, headers=agent_headers)
        assert material["id"] == repeat["id"]
        set_id = material["id"]
        queue = request("GET", f"/study/sets/{set_id}/queue")
        assert len(queue["items"]) == 10
        review_id = str(uuid4())
        review = {
            "reviews": [
                {
                    "client_review_id": review_id,
                    "card_id": material["cards"][0]["id"],
                    "direction": "term_to_def",
                    "mode": "learn",
                    "rating": 3,
                    "reviewed_at": datetime.now(UTC).isoformat(),
                }
            ]
        }
        assert review_id in request("POST", "/study/reviews", json=review)["accepted"]
        assert review_id in request("POST", "/study/reviews", json=review)["duplicates"]
        request("POST", f"/study/sets/{set_id}/tests", json={"question_count": 5})
        pdf = client.get(f"/api/v1/sets/{set_id}/export?format=pdf")
        assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")
        picture = io.BytesIO()
        Image.new("RGB", (20, 20), "blue").save(picture, "PNG")
        payload = picture.getvalue()
        ticket = request(
            "POST",
            "/media/upload-url",
            json={"filename": "smoke.png", "mime": "image/png", "size_bytes": len(payload)},
        )
        # Не передаём токен пользователя в S3 и не печатаем подписанные ссылки.
        with httpx.Client(timeout=45) as storage:
            assert (
                storage.put(
                    ticket["upload_url"], headers=ticket["headers"], content=payload
                ).status_code
                == 200
            )
            asset = request("POST", f"/media/{ticket['id']}/complete")
            assert storage.get(asset["download_url"]).content == payload
            unsigned = asset["download_url"].split("?")[0]
            assert storage.get(unsigned).status_code == 403
        job = request("POST", "/users/me/export")
        for _ in range(30):
            result = request("GET", f"/users/me/export/{job['id']}")
            if result["status"] == "completed":
                with httpx.Client(timeout=45) as storage:
                    archive = storage.get(result["download_url"])
                    assert archive.status_code == 200 and archive.content.startswith(b"PK")
                break
            assert result["status"] != "failed", "Export failed"
            time.sleep(1)
        else:
            raise AssertionError("Export timeout")
        request("DELETE", f"/users/me/api-tokens/{token['id']}")
        print("OK: register, PAT, 10 cards, idempotency, FSRS, test, PDF, private S3, worker ZIP")
        print("Technical account:", username, "set:", set_id)


if __name__ == "__main__":
    main()
