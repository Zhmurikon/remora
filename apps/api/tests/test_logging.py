import json
import logging
from pathlib import Path

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from starlette.responses import JSONResponse

from app.core.logging import RequestIdMiddleware, configure_logging


def _read_events(path: Path) -> list[dict[str, object]]:
    for handler in logging.getLogger().handlers:
        handler.flush()
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]


async def test_debug_logging_records_request_details(tmp_path: Path) -> None:
    log_file = tmp_path / "api.log"
    configure_logging(json_output=True, level="DEBUG", log_file=log_file)
    app = FastAPI()
    app.add_middleware(RequestIdMiddleware)

    @app.get("/items/{item_id}")
    async def item(item_id: int) -> dict[str, int]:
        return {"item_id": item_id}

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(
            "/items/42?token=secret",
            headers={"Authorization": "Bearer secret", "X-Request-ID": "request-42"},
        )

    assert response.status_code == 200
    events = _read_events(log_file)
    completed = next(event for event in events if event["event"] == "http.request.completed")
    assert completed["path"] == "/items/42"
    assert completed["route"] == "/items/{item_id}"
    assert completed["status_code"] == 200
    assert completed["request_id"] == "request-42"
    assert "secret" not in log_file.read_text(encoding="utf-8")


async def test_info_logging_records_server_error(tmp_path: Path) -> None:
    log_file = tmp_path / "api.log"
    configure_logging(json_output=True, level="INFO", log_file=log_file)
    app = FastAPI()
    app.add_middleware(RequestIdMiddleware)

    @app.get("/broken")
    async def broken() -> JSONResponse:
        return JSONResponse({"code": "INTERNAL_ERROR"}, status_code=500)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/broken")

    assert response.status_code == 500
    events = _read_events(log_file)
    assert [event["event"] for event in events] == ["http.request.server_error"]


async def test_exception_logging_includes_traceback(tmp_path: Path) -> None:
    log_file = tmp_path / "api.log"
    configure_logging(json_output=True, level="INFO", log_file=log_file)
    app = FastAPI()
    app.add_middleware(RequestIdMiddleware)

    @app.get("/crash")
    async def crash() -> None:
        raise RuntimeError("diagnostic failure")

    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/crash")

    assert response.status_code == 500
    events = _read_events(log_file)
    failed = next(event for event in events if event["event"] == "http.request.failed")
    assert "RuntimeError: diagnostic failure" in str(failed["exception"])
