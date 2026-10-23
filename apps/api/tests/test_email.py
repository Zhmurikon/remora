from unittest.mock import AsyncMock

from app.core import email


async def test_service_email_subjects_use_public_brand(monkeypatch) -> None:
    send = AsyncMock()
    monkeypatch.setattr(email, "send_email", send)

    await email.send_verification_email("reader@example.com", "verify-token")
    await email.send_password_reset_email("reader@example.com", "reset-token")
    await email.send_account_export_email("reader@example.com", "https://storage.test/archive", 24)

    assert [call.args[1] for call in send.await_args_list] == [
        "Подтверждение регистрации — Запоминальня",
        "Восстановление пароля — Запоминальня",
        "Архив ваших данных готов — Запоминальня",
    ]
    assert all("Remora" not in call.args[2] for call in send.await_args_list)
