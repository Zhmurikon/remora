#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
dc() { docker compose --env-file .env -f compose.yml "$@"; }
# Защищаем сборку и миграции от одновременного запуска двух обновлений.
exec 9>.update.lock
flock -n 9 || { echo 'Уже выполняется обновление'; exit 1; }
dc build api web
dc up -d postgres redis meilisearch minio mailhog
dc run --rm minio-init
mkdir -p backups
chmod 700 backups
backup="backups/$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
dc exec -T postgres pg_dump -U remora remora | gzip > "$backup"
chmod 600 "$backup"
# Общие зависимости и артефакты не меняются под работающими процессами.
dc stop gateway web worker api telegram-bot vk-bot bot-api
dc run --rm --no-deps api uv sync --frozen
dc run --rm --no-deps api alembic upgrade head
dc run --rm --no-deps web pnpm install --frozen-lockfile
dc up -d --wait api
dc run --rm --no-deps web pnpm build
dc up -d --wait web worker bot-api telegram-bot vk-bot gateway
dc exec -T api python -c 'import json,urllib.request; r=json.load(urllib.request.urlopen("http://localhost:8000/api/v1/ready")); print(r); assert r["status"] == "ok"'
dc exec -T gateway nginx -t
echo "Обновление завершено. Резервная копия БД: $backup"
