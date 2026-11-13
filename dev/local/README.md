# Локальная копия Запоминальни

Открывайте [сайт](http://localhost:3000/), [учебный кабинет](http://localhost:3000/app/), [админку](http://localhost:5174/) и [локальную почту](http://localhost:8025/). Восстановление пароля на локальной странице отправляет письмо в MailHog. Для входа можно использовать пароль скопированного аккаунта. Авторизация через Google, внешние боты, платёжные и ИИ-сервисы требуют отдельных тестовых реквизитов.

## Работа с готовой копией

Из корня репозитория:

```bash
docker compose -f dev/local/compose.yml up -d
docker compose -f dev/local/compose.yml ps
docker compose -f dev/local/compose.yml logs -f web api
docker compose -f dev/local/compose.yml stop
```

Правьте файлы в обычном рабочем дереве. Публичный сайт использует Next Fast Refresh, кабинет и админка — Vite HMR. Uvicorn и watchfiles для worker перечитывают Python-код. Для смены зависимостей выполните `pnpm install --frozen-lockfile` или `dev/local/sync-python.sh` по соответствующему lock-файлу. Изменения переменных окружения или конфигурации самого контейнера применяются через `docker compose -f dev/local/compose.yml up -d`. Кэш Next.js хранится в `.private/local-next/`. Баннер cookie доступен для предпросмотра на localhost, запросы в рабочую Метрику отсюда выключены.

PostgreSQL, Redis, Meilisearch и MinIO используют отдельные тома проекта `zapominalnya-local`. Порты шлюза опубликованы на 127.0.0.1. Приватная сеть Docker изолирует сервисы приложения от интернета. Шлюз передаёт запросы с хоста к сайту, админке, почте и подписанным ссылкам MinIO (`s3.localhost:9100`). Учётные данные этой копии генерирует `init.sh` в `dev/local/.env`. Удаление томов через `down -v` уничтожит локальные данные.

## Снимки данных

Снимок от 12.11.2026 хранится вне Git в `~/.local/share/zapominalnya/backups/`. Точный путь последнего снимка на этой машине записан в `.private/local-copy-backup-path`.

- `database.dump` — согласованный дамп PostgreSQL в формате pg_restore.
- `objects.zip` — объекты двух приватных бакетов, ключи и метаданные. Объекты читаются после снимка базы, каждый с проверкой ETag. Redis и поисковый индекс создаются локально.
- `source-<commit>.tar.gz` — исходники опубликованной версии из Git. Локальный сайт запускается из рабочей папки с текущими правками.
- `SHA256SUMS` — контрольные суммы трёх файлов.

### Восстановление снимка в новую копию

На уже запущенной копии повторное восстановление не требуется. Следующие команды предназначены для Linux, свежего тома базы и пустых бакетов. Выполнять в одной оболочке из корня репозитория. Образ API собирается из штатного Dockerfile, если его ещё нет на машине.

```bash
set -euo pipefail
snapshot=$(cat .private/local-copy-backup-path)
(cd "$snapshot" && sha256sum -c SHA256SUMS)
dev/local/init.sh
docker image inspect remora-dev-api:local >/dev/null 2>&1 || docker build -t remora-dev-api:local -f deploy/Dockerfile.api deploy
dev/local/sync-python.sh
pnpm install --frozen-lockfile
dc=(docker compose -f dev/local/compose.yml)
"${dc[@]}" up -d --wait postgres redis minio meilisearch mailhog
test "$("${dc[@]}" exec -T postgres psql -U remora -d remora -Atc "select count(*) from pg_tables where schemaname='public'")" = 0
"${dc[@]}" exec -T postgres pg_restore --single-transaction --exit-on-error --no-owner --no-acl -U remora -d remora < "$snapshot/database.dump"
"${dc[@]}" exec -T minio sh -ec 'mc alias set localdev http://localhost:9100 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null; mc mb --ignore-existing localdev/remora-media localdev/remora-audio'
"${dc[@]}" run --rm --no-deps -T -v "$snapshot/objects.zip:/backup.zip:ro" api python - restore /backup.zip < dev/local/objects.py
"${dc[@]}" run --rm --no-deps -T api alembic upgrade head
"${dc[@]}" run --rm --no-deps -T api python -c 'import asyncio; from app.services.search_sync import synchronize_courses; asyncio.run(synchronize_courses())'
"${dc[@]}" up -d
curl --noproxy '*' -fsS http://localhost:3000/api/v1/ready
```

Git push и выпуск на рабочий сайт выполняются только по явной команде владельца.
