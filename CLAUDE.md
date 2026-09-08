# CLAUDE.md — правила работы над Remora

Remora — платформа для заучивания через карточки, аналог Quizlet для РФ и СНГ.
Продуктовые решения зафиксированы в `docs/`. Перед изменением архитектуры прочитать
`docs/02-functional-spec.md`, перед изменением тарифов и квот — `docs/04-limits.md`.

## Команды

```bash
pnpm install            # зависимости фронтенда
cd apps/api && uv sync  # зависимости бэкенда

docker compose up -d    # postgres, redis, meilisearch, minio, mailhog
pnpm dev                # оба фронтенда параллельно
pnpm dev:web            # только публичный сайт  → :3000
pnpm dev:app            # только кабинет         → :5173

cd apps/api && uv run uvicorn app.main:app --reload   # API → :8000

pnpm gen:api            # перегенерировать TS-клиент из OpenAPI
pnpm lint / typecheck / test / build
pnpm format             # prettier (docs и README исключены намеренно)

cd apps/api && uv run ruff check . && uv run mypy app && uv run pytest
cd apps/api && uv run alembic revision --autogenerate -m "..."
cd apps/api && uv run alembic upgrade head
```

## Структура

```
apps/api      FastAPI: routers (app/api/v1) → services → repositories → models
apps/web      Next.js — публичный сайт, всё что индексируется
apps/app      Vite React SPA — кабинет, всё что за логином
packages/ui   дизайн-система: токены в src/styles/tokens.css, компоненты в src/components
packages/core доменные типы и логика, общая для обоих фронтендов
packages/api-client  клиент из OpenAPI; src/generated/schema.ts генерируется
packages/config      tsconfig, tailwind-пресет
```

## Правила, которые нельзя нарушать

**Граница фронтендов.** Страница должна попасть в поиск — она в `apps/web`. Интерактивная
работа авторизованного пользователя — в `apps/app`. Промежуточных случаев не создаём.

**Обучение не лимитируется.** Ни один режим обучения, ни число повторений, ни доступ к своим
наборам не могут зависеть от тарифа. Список неприкосновенного — раздел 3 в `docs/04-limits.md`.

**Проверки тарифа — только через `Entitlements`.** Никаких `if plan == 'plus'` по коду.

**Ошибки API — единый формат** (`app/core/errors.py`): `{code, message, details}`. Клиент
принимает решения по `code` и `details.limit_key`, а не по тексту сообщения.

**Ответы пользователя нельзя терять.** Отправка ответов из тренировки идёт батчами,
идемпотентно по `client_review_id`, с локальной очередью при обрыве сети.

**Схема API коммитится.** После изменения эндпоинтов — `pnpm gen:api` и коммит
`packages/api-client/src/generated/schema.ts`. CI это проверяет.

## Соглашения по коду

**Python:** строгий mypy, ruff. Асинхронный SQLAlchemy 2.0 (`Mapped[...]`, `mapped_column`).
Слои не перепрыгивать: роутер не ходит в БД напрямую, бизнес-логика в сервисах.
Имена ограничений БД задаёт `NAMING_CONVENTION` — новые модели наследуют `Base`.

**TypeScript:** strict, `verbatimModuleSyntax` (импорты типов — через `import type`).
Серверное состояние — TanStack Query, локальное состояние сессии обучения — Zustand.
Цвета только через токены (`bg-surface`, `text-fg-muted`), без произвольных hex.
Тёмная тема обязана работать: любые новые цвета добавляются в оба блока `tokens.css`.

**Доступность:** во всех режимах обучения работает клавиатура, у интерактивных элементов
видимый фокус, цели нажатия от 44px на мобильном.

**Комментарии** на русском, объясняют «почему», а не «что». Тексты интерфейса — на русском.

## Тесты

Обязательное покрытие (см. `docs/02-functional-spec.md`, раздел 7): FSRS-планировщик,
нормализация ответов, парсеры импорта, вебхуки биллинга, проверки прав доступа.
Тест на права доступа — обязателен для каждого нового ресурса: чужой пользователь
не должен получать чужие данные.

## Текущий этап

E0 завершён: каркас монорепо, FastAPI со слоями, оба фронтенда, docker-compose, CI.
Следующий — E1 (аутентификация), см. `docs/03-roadmap.md`.
