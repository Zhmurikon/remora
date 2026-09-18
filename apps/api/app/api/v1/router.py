"""Сборка роутеров версии v1.

Каждый домен из docs/02-functional-spec.md подключается сюда одной строкой:
auth, users, folders, sets, cards, media, tts, study, tests, import, search,
catalog, classes, assignments, gamification, billing, moderation.
"""

from fastapi import APIRouter

from app.api.v1 import (
    agent,
    api_tokens,
    auth,
    authors,
    bots,
    courses,
    exports,
    folders,
    health,
    imports,
    library,
    media,
    printing,
    search,
    sets,
    study,
    tts,
    users,
)

api_router = APIRouter()
api_router.include_router(bots.router)
api_router.include_router(agent.router)
api_router.include_router(api_tokens.router)
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(authors.router)
api_router.include_router(courses.router)
api_router.include_router(library.router)
api_router.include_router(search.router)
api_router.include_router(users.router)
api_router.include_router(folders.router)
api_router.include_router(sets.router)
api_router.include_router(exports.router)
api_router.include_router(media.router)
api_router.include_router(imports.router)
api_router.include_router(study.router)
api_router.include_router(tts.router)
api_router.include_router(printing.router)
