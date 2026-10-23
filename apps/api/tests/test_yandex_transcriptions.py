import base64
import json

from app.services.yandex_transcriptions import (
    build_recognition_request,
    parse_recognition_result,
)


def test_yandex_request_uses_deferred_model_and_mp3() -> None:
    request = build_recognition_request(b"audio", "ru")

    assert base64.b64decode(request["content"]) == b"audio"
    model = request["recognitionModel"]
    assert model["model"] == "deferred-general"
    assert model["audioFormat"]["containerAudio"]["containerAudioType"] == "MP3"
    assert model["languageRestriction"]["languageCode"] == ["ru-RU"]


def test_yandex_result_collects_and_normalizes_final_phrases() -> None:
    messages = [
        {"result": {"final": {"alternatives": [{"text": "первая фраза"}]}}},
        {"result": {"final": {"alternatives": [{"text": "вторая фраза"}]}}},
        {
            "result": {
                "finalRefinement": {
                    "finalIndex": "0",
                    "normalizedText": {"alternatives": [{"text": "Первая фраза."}]},
                }
            }
        },
    ]
    payload = "\n".join(json.dumps(message, ensure_ascii=False) for message in messages)

    assert parse_recognition_result(payload) == "Первая фраза.\nвторая фраза"
