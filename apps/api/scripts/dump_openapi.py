"""Печатает OpenAPI-схему приложения в stdout.

Запущенный сервер не нужен: схема собирается из объекта FastAPI напрямую,
поэтому генерация клиента работает и в CI, и без доступа к сети.

    uv run python scripts/dump_openapi.py > openapi.json
"""

import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Схеме нужны валидные настройки, но не нужны живые Postgres и Redis.
os.environ.setdefault("SECRET_KEY", "openapi-dump-secret-key-at-least-32-chars")
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://remora:remora@localhost:5432/remora")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("ENVIRONMENT", "local")

from app.main import create_app

if __name__ == "__main__":
    schema = create_app().openapi()
    json.dump(schema, sys.stdout, ensure_ascii=False, indent=2, sort_keys=True)
    sys.stdout.write("\n")
