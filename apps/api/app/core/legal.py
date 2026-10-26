"""Версии правовых документов и возрастные правила регистрации."""

from datetime import date

PDN_CONSENT_VERSION = "2026-10-26"
OFFER_VERSION = "2026-10-26"
GUARDIAN_CONSENT_VERSION = "2026-10-26"


def age_on(birth_date: date, today: date | None = None) -> int:
    current = today or date.today()
    return (
        current.year
        - birth_date.year
        - ((current.month, current.day) < (birth_date.month, birth_date.day))
    )


def requires_guardian_consent(birth_date: date) -> bool:
    return age_on(birth_date) < 14
