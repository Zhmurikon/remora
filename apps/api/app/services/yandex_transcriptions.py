"""Клиент отложенного распознавания SpeechKit v3 для закрытого инструмента."""

import asyncio
import base64
import json
from pathlib import Path
from typing import Any

import httpx

RECOGNIZE_URL = "https://stt.api.cloud.yandex.net/stt/v3/recognizeFileAsync"
OPERATION_URL = "https://operation.api.cloud.yandex.net/operations"
RESULT_URL = "https://stt.api.cloud.yandex.net/stt/v3/getRecognition"


def build_recognition_request(audio: bytes, language: str | None) -> dict[str, Any]:
    model: dict[str, Any] = {
        "model": "deferred-general",
        "audioFormat": {"containerAudio": {"containerAudioType": "MP3"}},
        "textNormalization": {"textNormalization": "TEXT_NORMALIZATION_ENABLED"},
    }
    language_code = {"ru": "ru-RU", "en": "en-US"}.get(language or "")
    if language_code:
        model["languageRestriction"] = {
            "restrictionType": "WHITELIST",
            "languageCode": [language_code],
        }
    return {
        "content": base64.b64encode(audio).decode("ascii"),
        "recognitionModel": model,
    }


def parse_recognition_result(payload: str) -> str:
    """Собирает финальные фразы из NDJSON-ответа SpeechKit."""
    messages: list[dict[str, Any]] = []
    try:
        decoded = json.loads(payload)
        if isinstance(decoded, dict):
            messages = [decoded]
        elif isinstance(decoded, list):
            messages = [item for item in decoded if isinstance(item, dict)]
    except json.JSONDecodeError:
        for line in payload.splitlines():
            if not line.strip():
                continue
            item = json.loads(line)
            if isinstance(item, dict):
                messages.append(item)

    finals: list[str] = []
    refinements: dict[int, str] = {}
    for message in messages:
        result = message.get("result", message)
        if not isinstance(result, dict):
            continue
        final = result.get("final")
        if isinstance(final, dict):
            text = _first_alternative_text(final)
            if text:
                finals.append(text)
        refinement = result.get("finalRefinement")
        if isinstance(refinement, dict):
            normalized = refinement.get("normalizedText")
            text = _first_alternative_text(normalized) if isinstance(normalized, dict) else None
            try:
                index = int(refinement.get("finalIndex", -1))
            except (TypeError, ValueError):
                index = -1
            if text and index >= 0:
                refinements[index] = text

    for index, text in refinements.items():
        if index < len(finals):
            finals[index] = text
    result_text = "\n".join(finals).strip()
    if not result_text:
        raise RuntimeError("SpeechKit returned no final text")
    return result_text


def _first_alternative_text(update: dict[str, Any]) -> str | None:
    alternatives = update.get("alternatives")
    if not isinstance(alternatives, list) or not alternatives:
        return None
    first = alternatives[0]
    if not isinstance(first, dict):
        return None
    text = first.get("text")
    return text.strip() if isinstance(text, str) and text.strip() else None


class YandexSpeechKitTranscriber:
    def __init__(
        self,
        api_key: str,
        *,
        folder_id: str | None,
        max_audio_bytes: int,
    ) -> None:
        self.headers = {"Authorization": f"Api-Key {api_key}"}
        if folder_id:
            self.headers["x-folder-id"] = folder_id
        self.max_audio_bytes = max_audio_bytes

    async def submit(self, audio_path: Path, language: str | None) -> str:
        size = (await asyncio.to_thread(audio_path.stat)).st_size
        if size > self.max_audio_bytes:
            raise RuntimeError("SpeechKit audio exceeds the test-mode limit")
        audio = await asyncio.to_thread(audio_path.read_bytes)
        timeout = httpx.Timeout(60.0, connect=15.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                RECOGNIZE_URL,
                headers=self.headers,
                json=build_recognition_request(audio, language),
            )
            response.raise_for_status()
            operation = response.json()
            operation_id = operation.get("id")
            if not isinstance(operation_id, str) or not operation_id:
                raise RuntimeError("SpeechKit returned no operation id")
            return operation_id

    async def get_operation(self, operation_id: str) -> dict[str, Any]:
        timeout = httpx.Timeout(30.0, connect=15.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(f"{OPERATION_URL}/{operation_id}", headers=self.headers)
            response.raise_for_status()
            operation = response.json()
        if not isinstance(operation, dict):
            raise RuntimeError("SpeechKit returned an invalid operation")
        return operation

    async def get_result(self, operation_id: str) -> str:
        timeout = httpx.Timeout(60.0, connect=15.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            result_response = await client.get(
                RESULT_URL,
                headers=self.headers,
                params={"operation_id": operation_id},
            )
            result_response.raise_for_status()
            return parse_recognition_result(result_response.text)
