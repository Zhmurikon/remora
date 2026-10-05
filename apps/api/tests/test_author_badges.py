from app.schemas.authors import AuthorStats
from app.services.authors import _badges


def test_author_profile_badges_cover_publication_popularity_learning_and_streak() -> None:
    badges = _badges(
        AuthorStats(
            publications=5,
            saves_received=100,
            likes_received=10,
            cards_studied=1000,
            current_streak_days=7,
        )
    )
    assert [badge.code for badge in badges] == [
        "published_1",
        "published_5",
        "saves_10",
        "saves_100",
        "likes_10",
        "studied_100",
        "studied_1000",
        "streak_3",
        "streak_7",
    ]
