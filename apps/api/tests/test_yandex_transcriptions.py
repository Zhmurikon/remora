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
    assert model["textNormalization"] == {
        "textNormalization": "TEXT_NORMALIZATION_ENABLED",
        "literatureText": True,
    }


def test_yandex_request_supports_fast_mode_and_speaker_labeling() -> None:
    request = build_recognition_request(
        b"audio", "ru", fast_mode=True, speaker_labeling=True
    )

    assert request["recognitionModel"]["model"] == "general"
    assert request["recognitionModel"]["audioProcessingType"] == "FULL_DATA"
    assert request["speakerLabeling"] == {
        "speakerLabeling": "SPEAKER_LABELING_ENABLED"
    }


def test_yandex_result_collects_and_normalizes_final_phrases() -> None:
    messages = [
        {
            "result": {
                "final": {
                    "alternatives": [
                        {"text": "первая фраза", "startTimeMs": "1200", "endTimeMs": "2500"}
                    ],
                    "channelTag": "0",
                }
            }
        },
        {
            "result": {
                "final": {
                    "alternatives": [
                        {"text": "вторая фраза", "startTimeMs": "65000", "endTimeMs": "70000"}
                    ],
                    "channelTag": "1",
                }
            }
        },
        {
            "result": {
                "finalRefinement": {
                    "finalIndex": "0",
                    "normalizedText": {
                        "alternatives": [
                            {"text": "Первая фраза.", "startTimeMs": "1200", "endTimeMs": "2500"}
                        ],
                        "channelTag": "0",
                    },
                }
            }
        },
    ]
    payload = "\n".join(json.dumps(message, ensure_ascii=False) for message in messages)

    result = parse_recognition_result(
        payload, phrase_timestamps=True, speaker_labeling=True
    )

    assert result.text == "[00:01] Диктор 1: Первая фраза.\n[01:05] Диктор 2: вторая фраза"
    assert result.data["schemaVersion"] == 1
    assert result.data["messages"] == messages
    assert result.data["phrases"][0]["startTimeMs"] == 1200
