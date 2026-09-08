"""Сборка роутеров версии v1.

Каждый домен из docs/02-functional-spec.md подключается сюда одной строкой:
auth, users, folders, sets, cards, media, tts, study, tests, import, search,
catalog, classes, assignments, gamification, billing, moderation.
"""

from fastapi import APIRouter

from app.api.v1 import health

api_router = APIRouter()
api_router.include_router(health.router)
