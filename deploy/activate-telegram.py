"""Запускать явно в контейнере telegram-bot после проверки HTTPS-маршрута."""

import os

import httpx

try:
    with httpx.Client(timeout=20, trust_env=False, proxy=os.getenv("TG_PROXY_URL") or None) as client:
        base = "https://api.telegram.org/bot" + os.environ["TG_BOT_TOKEN"] + "/"
        method = "deleteWebhook" if os.getenv("TG_UPDATE_MODE") == "polling" else "setWebhook"
        response = client.post(base + method, json={
            "url": "https://test.edu-remora.ru/callback/tg_v1/",
            "secret_token": os.environ["TG_WEBHOOK_SECRET"],
            "allowed_updates": ["message", "callback_query"],
            "drop_pending_updates": False,
        }).json()
        assert response.get("ok"), "Webhook rejected"
        info = client.get(base + "getWebhookInfo").json()["result"]
        print({key: info.get(key) for key in ["url", "pending_update_count", "last_error_message"]})
except Exception as exc:
    raise SystemExit("Webhook setup failed: " + type(exc).__name__) from None
