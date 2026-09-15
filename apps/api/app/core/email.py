"""Отправка email через SMTP (aiosmtplib).

В разработке — MailHog (localhost:1025), в проде — SMTP-провайдер.
"""

from __future__ import annotations

from email.message import EmailMessage

import structlog
from aiosmtplib import SMTP

from app.core.config import get_settings

log = structlog.get_logger()


async def send_email(
    to: str,
    subject: str,
    body: str,
    *,
    html: str | None = None,
) -> None:
    settings = get_settings()

    message = EmailMessage()
    message["From"] = str(settings.smtp_from)
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)
    if html:
        message.add_alternative(html, subtype="html")

    smtp = SMTP(
        hostname=settings.smtp_host,
        port=settings.smtp_port,
        start_tls=settings.smtp_start_tls,
    )
    try:
        await smtp.connect()
        if settings.smtp_username and settings.smtp_password:
            await smtp.login(
                settings.smtp_username,
                settings.smtp_password.get_secret_value(),
            )
        await smtp.send_message(message)
        log.info("email.sent", to=to, subject=subject)
    except Exception:
        log.error("email.send_failed", to=to, subject=subject)
        raise
    finally:
        if smtp.is_connected:
            await smtp.quit()


async def send_verification_email(to: str, token: str) -> None:
    settings = get_settings()
    link = f"{settings.app_url}/verify-email?token={token}"
    subject = "Подтверждение регистрации — Remora"
    body = (
        f"Здравствуйте!\n\n"
        f"Подтвердите ваш email, перейдя по ссылке:\n{link}\n\n"
        f"Ссылка действительна {settings.email_verification_ttl_hours} часов.\n\n"
        f"Если вы не регистрировались — просто проигнорируйте это письмо."
    )
    await send_email(to, subject, body)


async def send_password_reset_email(to: str, token: str) -> None:
    settings = get_settings()
    link = f"{settings.app_url}/reset-password?token={token}"
    subject = "Восстановление пароля — Remora"
    body = (
        f"Здравствуйте!\n\n"
        f"Для сброса пароля перейдите по ссылке:\n{link}\n\n"
        f"Ссылка действительна {settings.password_reset_ttl_minutes} минут.\n\n"
        f"Если вы не запрашивали сброс пароля — проигнорируйте это письмо."
    )
    await send_email(to, subject, body)
