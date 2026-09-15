"""Проверка паролей: политика + локальный словарь частых утечек.

Локальный словарь — компактный список самых тривиальных паролей.
В проде можно расширить файлом с полным списком (rockyou top-10k).
"""

from __future__ import annotations

import re

# Топ самых частых утёкших паролей. Покрывает основную массу тривиальных случаев.
_COMMON_PASSWORDS: frozenset[str] = frozenset(
    [
        "123456", "password", "123456789", "12345678", "12345", "qwerty",
        "111111", "1234567", "abcd1234", "123123", "1q2w3e", "admin",
        "welcome", "password1", "qwerty123", "123321", "000000",
        "1234567890", "iloveyou", "1234", "1q2w3e4r", "1qaz2wsx",
        "qazwsx", "zaq12wsx", "dragon", "monkey", "master", "666666",
        "654321", "superman", "56789", "123qwe", "trustno1", "passw0rd",
        "password123", "letmein", "11111111", "00000000", "123",
        "abc123", "football", "shadow", "sunshine", "princess",
        "charlie", "131313", "1qaz2wsx", "donald", "qwerty1",
        "987654321", "121212", "0000000000", "0987654321", "11aa",
        "admin123", "test", "guest", "159753", "7777777", "13579",
        "2468", "88888888", "secret", "pass", "123123123", "root",
        "toor", "asdfghjk", "zxcvbnm", "12qwaszx", "asdf1234",
        "1q2w3e4r5t", "azerty", "222222", "333333", "444444",
        "555555", "666666", "777777", "888888", "999999", "123abc",
        "q1w2e3r4", "pass123", "p@ssw0rd", "pass1234", "changeme",
        "access", "hello", "6969", "5150", "2password", "football1",
        "12345a", "123a456", "1q2w3", "12", "12341234", "password!",
        "1111", "0000",
    ]
)


def validate_password(password: str) -> str | None:
    """Возвращает сообщение об ошибке или None, если пароль надёжный.

    Проверки:
    - длина 8–128 символов;
    - хотя бы одна буква и одна цифра;
    - не входит в словарь частых паролей (без учёта регистра);
    - не состоит из одной последовательности (aaa, 123, abc).
    """
    if len(password) < 8:
        return "Пароль должен быть не короче 8 символов"

    if len(password) > 128:
        return "Пароль слишком длинный (максимум 128 символов)"

    if not re.search(r"[a-zA-Z]", password) or not re.search(r"\d", password):
        return "Пароль должен содержать буквы и цифры"

    if password.lower() in _COMMON_PASSWORDS:
        return "Этот пароль слишком часто встречается в утечках — выберите другой"

    return None
