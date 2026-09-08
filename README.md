# Remora

Веб-платформа для заучивания и запоминания через карточки. Аналог Quizlet для рынка РФ и СНГ: все режимы обучения бесплатны, в основе — алгоритм интервальных повторений FSRS.

Статус: **E0 завершён** — каркас проекта собран, разработка функционала начинается с E1.

## Быстрый старт

```bash
corepack enable && pnpm install
cd apps/api && uv sync && cd ../..
cp .env.example .env
docker compose up -d
cd apps/api && uv run alembic upgrade head && cd ../..
```

Дальше в трёх терминалах:

```bash
cd apps/api && uv run uvicorn app.main:app --reload   # API      → http://localhost:8000
pnpm dev:web                                          # сайт     → http://localhost:3000
pnpm dev:app                                          # кабинет  → http://localhost:5173
```

Документация API: http://localhost:8000/api/v1/docs. Почта разработки: http://localhost:8025.

## Структура

```
apps/api        FastAPI (Python 3.12): routers → services → repositories → models
apps/web        Next.js — публичный сайт: лендинг, каталог, страницы наборов, SEO
apps/app        Vite + React SPA — кабинет: библиотека, редактор, тренировки, классы
packages/ui     дизайн-система: токены и компоненты
packages/core   доменные типы и логика, общая для обоих фронтендов
packages/api-client   TypeScript-клиент, генерируется из OpenAPI
packages/config       tsconfig, tailwind-пресет
```

Почему два фронтенда: публичные страницы должны рендериться на сервере ради индексации в Яндексе, кабинет — быть отзывчивым SPA. Граница описана в [docs/02-functional-spec.md](docs/02-functional-spec.md), раздел 2.2.

## Документация

| Документ                                                 | Содержание                                                                                   |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [docs/01-product.md](docs/01-product.md)                 | Описание продукта: суть, аудитория, позиционирование, монетизация, метрики, риски             |
| [docs/02-functional-spec.md](docs/02-functional-spec.md) | Структура функционала: домены, архитектура, модель данных, требования по модулям, API, экраны |
| [docs/03-roadmap.md](docs/03-roadmap.md)                 | План разработки: 13 этапов от фундамента до запуска, 25–31 неделя                             |
| [docs/04-limits.md](docs/04-limits.md)                   | Лимиты и границы тарифов: таблицы квот, механика проверки, поведение при превышении           |
| [CLAUDE.md](CLAUDE.md)                                   | Правила работы над проектом и соглашения по коду                                              |

## Команды

```bash
pnpm dev            # оба фронтенда
pnpm gen:api        # перегенерировать клиент из OpenAPI (результат коммитится)
pnpm lint           # eslint
pnpm typecheck      # tsc по всем пакетам
pnpm test           # тесты фронтенда
pnpm build          # сборка обоих фронтендов

cd apps/api && uv run ruff check . && uv run mypy app && uv run pytest
```

## Зафиксированные решения

- **Платформа:** веб. Мобильные и офлайн — после запуска
- **Бэкенд:** Python 3.12 + FastAPI + PostgreSQL 16 + Redis + Meilisearch
- **Фронтенд:** Next.js (публичный SSR-сайт) + React SPA на Vite (приложение), монорепо pnpm
- **Алгоритм повторений:** FSRS
- **Аудитория:** школьники и студенты РФ/СНГ + преподаватели и школы
- **Монетизация:** freemium с лимитами. Все учебные режимы бесплатны и не ограничены, платное — объём, аналитика, автоматизация, классы. ЮKassa
- **Хостинг:** РФ (152-ФЗ)
- **ИИ:** не в MVP
