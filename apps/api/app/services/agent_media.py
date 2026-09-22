"""Безопасный импорт изображений по запросу внешнего агента."""

import asyncio
import base64
import binascii
import socket
from ipaddress import ip_address
from pathlib import Path
from urllib.parse import unquote, urlsplit

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import ConflictError
from app.models.user import User
from app.schemas.agent import AgentMediaUpload, AgentMediaUploadResult
from app.services.media import ALLOWED_IMAGE_MIMES, SVG_MIME, MediaService

DOWNLOAD_TIMEOUT_SECONDS = 20.0


class AgentMediaService:
    def __init__(self, db: AsyncSession) -> None:
        self.media = MediaService(db)
        self.settings = get_settings()

    async def upload(self, user: User, body: AgentMediaUpload) -> AgentMediaUploadResult:
        if body.data_base64 is not None:
            payload = _decode_base64(body.data_base64, self.settings.media_image_max_size_bytes)
            mime = body.mime or ""
            filename = body.filename or _default_filename(mime)
        else:
            assert body.source_url is not None
            payload, mime, remote_name = await _download_source(
                str(body.source_url), self.settings.media_image_max_size_bytes
            )
            filename = body.filename or remote_name
        if mime not in ALLOWED_IMAGE_MIMES:
            raise ConflictError("Поддерживаются JPEG, PNG, WebP, GIF и SVG")
        asset = await self.media.import_image(user, filename, payload, declared_mime=mime)
        alt = _markdown_alt(body.alt)
        return AgentMediaUploadResult(
            id=asset.id,
            mime=asset.mime,
            size_bytes=asset.size_bytes,
            width=asset.width,
            height=asset.height,
            markdown_reference=f"![{alt}](media:{asset.id})",
        )


def _decode_base64(value: str, max_bytes: int) -> bytes:
    try:
        payload = base64.b64decode(value, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ConflictError("Некорректные данные base64") from exc
    if not payload or len(payload) > max_bytes:
        raise ConflictError(
            "Изображение слишком большое или пустое", details={"max_size_bytes": max_bytes}
        )
    return payload


async def _download_source(
    url: str,
    max_bytes: int,
    *,
    transport: httpx.AsyncBaseTransport | None = None,
) -> tuple[bytes, str, str]:
    parsed = urlsplit(url)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise ConflictError("source_url должен быть публичным HTTPS-адресом без реквизитов")
    await _ensure_public_host(parsed.hostname, parsed.port or 443)
    timeout = httpx.Timeout(DOWNLOAD_TIMEOUT_SECONDS)
    try:
        async with (
            httpx.AsyncClient(
                timeout=timeout,
                trust_env=False,
                follow_redirects=False,
                transport=transport,
            ) as client,
            client.stream("GET", url, headers={"Accept": "image/*"}) as response,
        ):
            if response.is_redirect:
                raise ConflictError("Редиректы source_url запрещены")
            if response.status_code != 200:
                raise ConflictError("Не удалось скачать изображение")
            content_length = response.headers.get("content-length")
            if content_length and int(content_length) > max_bytes:
                raise ConflictError(
                    "Изображение слишком большое", details={"max_size_bytes": max_bytes}
                )
            mime = response.headers.get("content-type", "").split(";", 1)[0].strip().lower()
            chunks: list[bytes] = []
            size = 0
            async for chunk in response.aiter_bytes():
                size += len(chunk)
                if size > max_bytes:
                    raise ConflictError(
                        "Изображение слишком большое", details={"max_size_bytes": max_bytes}
                    )
                chunks.append(chunk)
    except ConflictError:
        raise
    except (httpx.HTTPError, OSError, ValueError) as exc:
        raise ConflictError("Не удалось безопасно скачать изображение") from exc
    payload = b"".join(chunks)
    if not payload:
        raise ConflictError("Источник вернул пустой файл")
    filename = Path(unquote(parsed.path)).name or _default_filename(mime)
    return payload, mime, filename[:255]


async def _ensure_public_host(host: str, port: int) -> None:
    try:
        direct = ip_address(host)
        addresses = [direct]
    except ValueError:
        try:
            records = await asyncio.get_running_loop().getaddrinfo(
                host, port, type=socket.SOCK_STREAM
            )
        except OSError as exc:
            raise ConflictError("Не удалось определить адрес source_url") from exc
        addresses = [ip_address(record[4][0]) for record in records]
    if not addresses or any(not address.is_global for address in addresses):
        raise ConflictError("source_url указывает на непубличный адрес")


def _default_filename(mime: str) -> str:
    suffixes = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/gif": ".gif",
        SVG_MIME: ".svg",
    }
    return "agent-image" + suffixes.get(mime, "")


def _markdown_alt(value: str) -> str:
    return (
        " ".join(value.splitlines()).replace("\\", "\\\\").replace("[", "\\[").replace("]", "\\]")
    )
