import random

import pytest
from httpx import AsyncClient
from pydantic import ValidationError

from app.core.distractors import generate_options
from app.schemas.content import CardWrite
from tests.test_test_mode import _auth, _create_test


@pytest.mark.parametrize(
    "field,values",
    [
        ("wrong_term_answers", [" TERM "]),
        ("wrong_definition_answers", ["definition"]),
        ("wrong_term_answers", [" "]),
        ("wrong_term_answers", ["ёж", "ЕЖ"]),
        ("wrong_definition_answers", ["synonym"]),
        ("wrong_term_answers", ["x" * 10001]),
        ("wrong_term_answers", [str(i) for i in range(31)]),
    ],
)
def test_reject_invalid_wrong_answers(field: str, values: list[str]) -> None:
    with pytest.raises(ValidationError):
        CardWrite.model_validate(
            {"term": "term", "definition": "definition", "alt_answers": ["synonym"], field: values}
        )


def test_preferred_options_and_fallback() -> None:
    for count in range(6):
        preferred = [f"authored-{i}" for i in range(count)]
        options = generate_options(
            "yes",
            ["a", "b", "c", "YES", "synonym"],
            preferred=preferred,
            alternatives=["synonym"],
            rng=random.Random(12),
        )
        assert len(options) == len(set(options)) == 4
        assert "yes" in options and "synonym" not in options
        assert len(set(options) & set(preferred)) == min(count, 3)


@pytest.mark.parametrize(
    "direction,field,correct",
    [
        ("term_to_def", "wrong_definition_answers", "cat"),
        ("def_to_term", "wrong_term_answers", "кот"),
    ],
)
async def test_round_trip_copy_queue_test_and_access(
    client: AsyncClient,
    direction: str,
    field: str,
    correct: str,
) -> None:
    headers = await _auth(client, "wrongowner")
    created = await client.post("/api/v1/sets", headers=headers, json={"title": "Варианты"})
    set_id = created.json()["id"]
    payload = {
        "term": "кот",
        "definition": "cat",
        "wrong_term_answers": ["кит", "крот", "скот"],
        "wrong_definition_answers": ["bat", "hat", "rat"],
    }
    saved = await client.put(
        f"/api/v1/sets/{set_id}/cards", headers=headers, json={"cards": [payload]}
    )
    assert saved.status_code == 200, saved.text
    card = saved.json()["cards"][0]
    read = await client.get(f"/api/v1/sets/{set_id}", headers=headers)
    assert read.json()["cards"][0][field] == payload[field]
    copy = await client.post(f"/api/v1/sets/{set_id}/duplicate", headers=headers)
    assert copy.json()["cards"][0][field] == payload[field]
    queue = await client.get(
        f"/api/v1/study/sets/{set_id}/queue", headers=headers, params={"direction": direction}
    )
    assert queue.status_code == 200
    assert queue.json()["items"][0]["card"][field] == payload[field]
    attempt = await _create_test(
        client,
        headers,
        set_id,
        kinds=["choice"],
        question_count=1,
        direction=direction,
        write_to_schedule=False,
    )
    question = attempt["questions"][0]
    assert question["kind"] == "choice"
    assert set(question["options"]) == {correct, *payload[field]}
    assert "answer" not in question and field not in question
    submitted = await client.post(
        f"/api/v1/study/tests/{attempt['id']}/submit",
        headers=headers,
        json={"answers": [{"question_id": question["id"], "value": payload[field][0]}]},
    )
    assert submitted.status_code == 200, submitted.text
    assert submitted.json()["correct_count"] == 0
    other = await _auth(client, "wrongother")
    assert (await client.get(f"/api/v1/sets/{set_id}", headers=other)).status_code == 403
    assert (
        await client.put(f"/api/v1/sets/{set_id}/cards", headers=other, json={"cards": [card]})
    ).status_code == 403
    cleared = await client.put(
        f"/api/v1/sets/{set_id}/cards",
        headers=headers,
        json={"cards": [{**card, "wrong_term_answers": [], "wrong_definition_answers": []}]},
    )
    assert cleared.json()["cards"][0][field] == []
