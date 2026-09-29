"""Структурные логи запросов с сохранением серверных ошибок и traceback."""

import logging
import sys
from collections.abc import Awaitable, Callable
from contextvars import ContextVar
from logging.handlers import RotatingFileHandler
from pathlib import Path
from time import perf_counter
from uuid import uuid4

import structlog
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

request_id_var: ContextVar[str] = ContextVar("request_id", default="-")


class _RemoraLogFilter(logging.Filter):
    """Не даёт сторонним библиотекам записать в файл URL с чувствительными параметрами."""

    def filter(self, record: logging.LogRecord) -> bool:
        return record.name == "remora" or record.name.startswith("remora.")


def configure_logging(
    *,
    json_output: bool,
    level: str = "INFO",
    log_file: Path | None = None,
    max_bytes: int = 20 * 1024 * 1024,
    backup_count: int = 10,
) -> None:
    """Настраивает stdout и необязательный ротируемый файл с JSON-строками."""

    numeric_level = getattr(logging, level.upper())
    handlers: list[logging.Handler] = [logging.StreamHandler(sys.stdout)]
    if log_file is not None:
        log_file.parent.mkdir(parents=True, exist_ok=True)
        file_handler = RotatingFileHandler(
            log_file,
            maxBytes=max_bytes,
            backupCount=backup_count,
            encoding="utf-8",
        )
        file_handler.addFilter(_RemoraLogFilter())
        handlers.append(file_handler)
    logging.basicConfig(format="%(message)s", level=numeric_level, handlers=handlers, force=True)

    processors: list[structlog.typing.Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        _add_request_id,
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]
    processors.append(
        structlog.processors.JSONRenderer() if json_output else structlog.dev.ConsoleRenderer()
    )

    structlog.configure(
        processors=processors,
        wrapper_class=structlog.make_filtering_bound_logger(numeric_level),
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=False,
    )


def _add_request_id(
    _logger: object, _name: str, event_dict: structlog.typing.EventDict
) -> structlog.typing.EventDict:
    event_dict["request_id"] = request_id_var.get()
    return event_dict


class RequestIdMiddleware(BaseHTTPMiddleware):
    """Связывает запрос с логами, подробно пишет debug и всегда фиксирует сбои 5xx."""

    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        request_id = request.headers.get("X-Request-ID") or uuid4().hex
        token = request_id_var.set(request_id)
        started_at = perf_counter()
        request_log = structlog.get_logger("remora.http")
        fields = {
            "method": request.method,
            "path": request.url.path,
            "client_ip": request.client.host if request.client else None,
            "user_agent": request.headers.get("user-agent"),
            "content_type": request.headers.get("content-type"),
            "content_length": request.headers.get("content-length"),
        }
        request_log.debug("http.request.started", **fields)
        try:
            try:
                response = await call_next(request)
            except Exception:
                request_log.exception(
                    "http.request.failed",
                    **fields,
                    duration_ms=round((perf_counter() - started_at) * 1000, 2),
                )
                raise
            route = request.scope.get("route")
            completed_fields = {
                **fields,
                "route": getattr(route, "path", None),
                "endpoint": getattr(getattr(route, "endpoint", None), "__name__", None),
                "status_code": response.status_code,
                "duration_ms": round((perf_counter() - started_at) * 1000, 2),
            }
            if response.status_code >= 500:
                request_log.error("http.request.server_error", **completed_fields)
            else:
                request_log.debug("http.request.completed", **completed_fields)
        finally:
            request_id_var.reset(token)
        response.headers["X-Request-ID"] = request_id
        return response
