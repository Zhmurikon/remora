"""Клиент отложенного распознавания SpeechKit v3 для закрытого инструмента."""

import asyncio
import base64
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx

RECOGNIZE_URL = "https://stt.api.cloud.yandex.net/stt/v3/recognizeFileAsync"
OPERATION_URL = "https://operation.api.cloud.yandex.net/operations"
RESULT_URL = "https://stt.api.cloud.yandex.net/stt/v3/getRecognition"


@dataclass(frozen=True)
class YandexRecognitionResult:
    text: str
    data: dict[str, Any]


def build_recognition_request(
    audio: bytes,
    language: str | None,
    *,
    fast_mode: bool = False,
    speaker_labeling: bool = False,
) -> dict[str, Any]:
    model: dict[str, Any] = {
        "model": "general" if fast_mode else "deferred-general",
        "audioFormat": {"containerAudio": {"containerAudioType": "MP3"}},
        "textNormalization": {
            "textNormalization": "TEXT_NORMALIZATION_ENABLED",
            "literatureText": True,
        },
    }
    language_code = {"ru": "ru-RU", "en": "en-US"}.get(language or "")
    if language_code:
        model["languageRestriction"] = {
            "restrictionType": "WHITELIST",
            "languageCode": [language_code],
        }
    request: dict[str, Any] = {
        "content": base64.b64encode(audio).decode("ascii"),
        "recognitionModel": model,
    }
    if speaker_labeling:
        model["audioProcessingType"] = "FULL_DATA"
        request["speakerLabeling"] = {"speakerLabeling": "SPEAKER_LABELING_ENABLED"}
    return request


def parse_recognition_result(
    payload: str,
    *,
    phrase_timestamps: bool = False,
    speaker_labeling: bool = False,
) -> YandexRecognitionResult:
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

    phrases: list[dict[str, Any]] = []
    refinements: dict[int, dict[str, Any]] = {}
    for message in messages:
        result = message.get("result", message)
        if not isinstance(result, dict):
            continue
        final = result.get("final")
        if isinstance(final, dict):
            alternative = _first_alternative(final)
            if alternative:
                phrases.append(
                    _phrase_from_alternative(
                        alternative,
                        final.get("channelTag", result.get("channelTag")),
                    )
                )
        refinement = result.get("finalRefinement")
        if isinstance(refinement, dict):
            normalized = refinement.get("normalizedText")
            alternative = _first_alternative(normalized) if isinstance(normalized, dict) else None
            try:
                index = int(refinement.get("finalIndex", -1))
            except (TypeError, ValueError):
                index = -1
            if alternative and index >= 0:
                channel_tag = (
                    normalized.get("channelTag", result.get("channelTag"))
                    if isinstance(normalized, dict)
                    else result.get("channelTag")
                )
                refinements[index] = _phrase_from_alternative(
                    alternative,
                    channel_tag,
                )

    for index, refinement in refinements.items():
        if index < len(phrases):
            original = phrases[index]
            phrases[index] = {
                **original,
                **{key: value for key, value in refinement.items() if value is not None},
            }
    result_text = "\n".join(
        _format_phrase(phrase, phrase_timestamps, speaker_labeling) for phrase in phrases
    ).strip()
    if not result_text:
        raise RuntimeError("SpeechKit returned no final text")
    return YandexRecognitionResult(
        text=result_text,
        data={"schemaVersion": 1, "phrases": phrases, "messages": messages},
    )


def _first_alternative(update: dict[str, Any]) -> dict[str, Any] | None:
    alternatives = update.get("alternatives")
    if not isinstance(alternatives, list) or not alternatives:
        return None
    first = alternatives[0]
    if not isinstance(first, dict):
        return None
    text = first.get("text")
    return first if isinstance(text, str) and text.strip() else None


def _phrase_from_alternative(alternative: dict[str, Any], channel_tag: Any) -> dict[str, Any]:
    text = alternative["text"].strip()
    return {
        "text": text,
        "startTimeMs": _optional_int(alternative.get("startTimeMs")),
        "endTimeMs": _optional_int(alternative.get("endTimeMs")),
        "channelTag": str(channel_tag) if channel_tag is not None else None,
        "confidence": alternative.get("confidence"),
        "words": alternative.get("words", []),
        "languages": alternative.get("languages", []),
    }


def _optional_int(value: Any) -> int | None:
    try:
        return int(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _format_phrase(
    phrase: dict[str, Any], phrase_timestamps: bool, speaker_labeling: bool
) -> str:
    parts: list[str] = []
    start_ms = phrase.get("startTimeMs")
    if phrase_timestamps and isinstance(start_ms, int):
        total_seconds = start_ms // 1000
        hours, remainder = divmod(total_seconds, 3600)
        minutes, seconds = divmod(remainder, 60)
        timestamp = (
            f"{hours:02d}:{minutes:02d}:{seconds:02d}"
            if hours
            else f"{minutes:02d}:{seconds:02d}"
        )
        parts.append(f"[{timestamp}]")
    if speaker_labeling:
        channel_tag = phrase.get("channelTag")
        try:
            speaker = int(channel_tag) + 1 if isinstance(channel_tag, (int, str)) else None
            if speaker is None:
                raise ValueError
            parts.append(f"Диктор {speaker}:")
        except (TypeError, ValueError):
            parts.append("Диктор:")
    parts.append(str(phrase["text"]))
    return " ".join(parts)


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

    async def submit(
        self,
        audio_path: Path,
        language: str | None,
        *,
        fast_mode: bool = False,
        speaker_labeling: bool = False,
    ) -> str:
        size = (await asyncio.to_thread(audio_path.stat)).st_size
        if size > self.max_audio_bytes:
            raise RuntimeError("SpeechKit audio exceeds the test-mode limit")
        audio = await asyncio.to_thread(audio_path.read_bytes)
        timeout = httpx.Timeout(60.0, connect=15.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                RECOGNIZE_URL,
                headers=self.headers,
                json=build_recognition_request(
                    audio,
                    language,
                    fast_mode=fast_mode,
                    speaker_labeling=speaker_labeling,
                ),
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

    async def get_result(
        self,
        operation_id: str,
        *,
        phrase_timestamps: bool = False,
        speaker_labeling: bool = False,
    ) -> YandexRecognitionResult:
        timeout = httpx.Timeout(60.0, connect=15.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            result_response = await client.get(
                RESULT_URL,
                headers=self.headers,
                params={"operation_id": operation_id},
            )
            result_response.raise_for_status()
            return parse_recognition_result(
                result_response.text,
                phrase_timestamps=phrase_timestamps,
                speaker_labeling=speaker_labeling,
            )
