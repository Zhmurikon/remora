# Дев-версия Запоминальни

Сервер `servtech`, каталог `/opt/remora-dev`. Всё приложение и сборка работают в Docker.
Host nginx завершает TLS и проксирует `zapominalnya.ru` на локальный порт gateway
`127.0.0.1:8280`. Канонический домен — `zapominalnya.ru`, кабинет —
`https://zapominalnya.ru/app`, административная панель — `https://admin.zapominalnya.ru`.
Административный домен использует отдельный server block на тот же gateway и собственный TLS;
gateway выбирает статическую сборку по заголовку Host. `www.zapominalnya.ru` перенаправляется
на домен без `www`.
Пример host-конфигурации с переходным старым доменом —
[`host-nginx.conf.example`](host-nginx.conf.example). Перед заменой проверить `nginx -t`;
сертификат `remora.com.ru` должен существовать до включения его HTTPS-блока.
`remora.com.ru`, `www.remora.com.ru`, `edu-remora.ru` и `test.edu-remora.ru` остаются
переходными алиасами. Их пользовательские страницы отдают `301` на `zapominalnya.ru` с тем же
путём и query-параметрами. Без редиректа
остаются `/api/`, callback Telegram/VK, `/remora-media/`, `/remora-audio/`,
`/rasshifrovka/api/` и `/rasshifrovka-yandex/api/`; MCP использует сохранённый
`/api/v1/agent/`.
В серверном `deploy/.env` значение `CORS_ORIGINS` должно включать публичный домен, `www`,
административный домен и оба переходных источника.
После изменения пересоздать api/worker/bot-api и перезагрузить gateway.

Первую роль администратора выдать существующему подтверждённому аккаунту из консоли сервера:

```bash
docker compose --env-file deploy/.env -f deploy/compose.yml exec -T api \
  python scripts/set_admin.py user@example.com
```

Публичного API для выдачи роли нет. После смены роли нужно заново войти на
`https://admin.zapominalnya.ru`, привязать приложение-аутентификатор и сохранить показанные
коды восстановления. В `deploy/.env` должен быть отдельный случайный
`ADMIN_2FA_ENCRYPTION_KEY`; менять его после привязки нельзя без процедуры переноса секретов.
При необходимости доступ дополнительно ограничивается CIDR-списком `ADMIN_ALLOWED_IPS`.

## Первая установка

Передать репозиторий без `.git`, `.env`, node_modules, .venv и артефактов сборки.
Не переносить локальную БД или пользовательские файлы.

```bash
cd /opt/remora-dev
docker build -t remora-dev-node:local -f deploy/Dockerfile.node deploy
docker run --rm -v /opt/remora-dev:/workspace remora-dev-node:local node deploy/init-env.mjs
docker build -t remora-dev-api:local -f deploy/Dockerfile.api deploy
```

До запуска compose подготовить окружение ботов: из локального `apps/api` выполнить
`uv run python ../../deploy/configure-bots.py` с реквизитами в локальном `.env`.
Скрипт создаёт на сервере `deploy/.env.telegram` и `deploy/.env.vk`; затем на сервере
выполнить `bash deploy/update.sh`. Настройка платформ и активация webhook описаны
в [docs/08-bots.md](../docs/08-bots.md).

`deploy/.env` создаётся один раз с независимыми секретами и правами 0600.
Не коммитить и не перезаписывать его при синхронизации. С 21.09.2026 на дев-сервере
включена реальная отправка через SMTP Timeweb (587, STARTTLS). Реквизиты хранятся
в `deploy/.env`. MailHog остаётся в compose для тестов, приложение его не использует.
Его интерфейс не публикуется в интернете.

### Вход через Google

Создать в Google Cloud Console OAuth client типа `Web application` и добавить точный
разрешённый redirect URI:

```text
https://zapominalnya.ru/api/v1/auth/oauth/google/callback
```

В `deploy/.env` задать `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` и
`GOOGLE_OAUTH_REDIRECT_URI`. Secret не передавать во фронтенды. После изменения пересоздать
контейнер `api`. Для локальной проверки используется callback
`http://localhost:8000/api/v1/auth/oauth/google/callback`; Google допускает HTTP только для
localhost. Google-профиль с подтверждённым Gmail или адресом Google Workspace автоматически
связывается с уже существующим аккаунтом Запоминальни. Сторонний адрес Google-аккаунта не сращивается
без дополнительного подтверждения владения почтой.

### Закрытая расшифровка через SpeechKit

Вторая скрытая страница `/rasshifrovka-yandex` использует тот же `TRANSCRIBER_ACCESS_CODE`,
но отдельную подписанную cookie. Для неё в `deploy/.env` нужен
`YANDEX_SPEECHKIT_API_KEY` сервисного аккаунта с ролью `ai.speechkit-stt.user`.
Идентификатор API-ключа не является идентификатором каталога и в env не нужен.
`YANDEX_SPEECHKIT_FOLDER_ID` остаётся необязательным; его задают только при необходимости
явно выбрать каталог. После изменения окружения пересоздать `web`, `api` и `worker`.

Тестовый контур передаёт сжатый MP3 непосредственно в SpeechKit API v3 и ограничивает
подготовленное аудио значением `YANDEX_TRANSCRIPTION_MAX_AUDIO_BYTES` (по умолчанию 60 МБ —
лимит тела запроса API v3). Идентификатор операции сохраняется в PostgreSQL, а worker раз в
минуту забирает готовые результаты, не занимая процесс ожиданием до 24 часов. Для отдельного
микросервиса длинных записей следует перейти на URI файла в Yandex Object Storage.

Для раздела `Google Auth Platform → Branding` использовать:

```text
App home page:       https://zapominalnya.ru
Privacy policy:      https://zapominalnya.ru/privacy
Terms of service:    https://zapominalnya.ru/terms
Authorized domain:   zapominalnya.ru
```

Загрузить `assets/brand/mark/remora-google-oauth.png`: это PNG 120 × 120 px, собранный
из утверждённого знака Запоминальни. Русские страницы доступны по адресам выше, английские —
по `/en/privacy` и `/en/terms`. Перед отправкой Branding на проверку убедиться, что адрес
`support@zapominalnya.ru`, указанный на юридических страницах, принимает письма, а сами страницы
опубликованы и открываются без авторизации.

### Логи API

API и внутренний API ботов пишут структурные логи в `deploy/logs/api.log` и
`deploy/logs/bot-api.log` на хосте. Каждый файл ротируется при достижении 20 МБ,
по умолчанию сохраняются 10 предыдущих файлов.
Параметры задаются через `LOG_FILE`, `LOG_LEVEL`, `LOG_MAX_BYTES` и
`LOG_BACKUP_COUNT` в `deploy/.env`. При `LOG_LEVEL=INFO` фиксируются серверные ответы 5xx
и необработанные исключения. При `LOG_LEVEL=DEBUG` дополнительно фиксируются начало и
завершение каждого HTTP-запроса, маршрут, обработчик, статус и длительность. Тела запросов,
cookie и заголовок авторизации в лог не попадают.

## Обновление

Из локального репозитория: `bash deploy/push.sh`. Скрипт сохраняет предыдущие исходники
в `/opt/remora-releases`, синхронизирует код и запускает серверное обновление.
Удалённые из Git файлы rsync автоматически не удаляет: такие изменения требуют
явного удаления конкретных устаревших файлов при выпуске.

Сначала сохранить предыдущий исходный релиз вне каталога приложения, затем передать
новые исходники, исключая `.env`, зависимости и сборки. Не использовать `rsync --delete`
на корне сервера. Запустить `bash deploy/update.sh`.

Исходники подключены через bind mount. Docker-образы среды берутся из кэша:
пересборка нужна при изменении Dockerfile, не при каждом изменении кода.
Python-зависимости находятся в volume; Node-зависимости и сборки — в каталоге проекта.
Скрипт устанавливает зависимости по lock-файлам, сохраняет БД, останавливает приложение,
применяет миграции, собирает фронтенды и запускает сервисы. Есть короткий простой.
При ошибке скрипт останавливается; не считать такой выпуск успешным.

БД, Redis, MinIO и поиск имеют собственные volumes. `docker compose down -v` запрещён
для обновлений: он удалит данные. К внешней сети proxy подключён только gateway.
S3 доступен по подписанным URL на `/remora-media/` и `/remora-audio/`; бакеты приватные.
Публичные страницы канонического домена доступны для индексации. `robots.txt` и
`sitemap.xml` формирует Next.js; кабинет, страницы входа и закрытая расшифровка сохраняют
собственные `noindex`-метатеги.

## Восстановление

Копии БД лежат в `deploy/backups` (0600), не отправляются в Git. Перед потенциально
несовместимой миграцией отдельно сохранить MinIO volume и исходный релиз.
Для отката кода вернуть прежний релиз и повторить сборку только если он совместим
с текущей схемой. Не запускать `alembic downgrade` вслепую.
При несовместимой миграции остановить API/worker и восстановить SQL-копию в **новую** БД,
переключить DATABASE_URL на неё, сохранив старую БД для разбора. Проверить `/api/v1/ready`,
вход, медиа и обучение до открытия трафика. Автоматическое восстановление и внешние
регулярные бэкапы — отдельная задача перед публичной бетой.

## Проверка

`docker compose -f deploy/compose.yml --env-file deploy/.env exec -T api python /workspace/deploy/smoke.py`
создаёт отдельный технический аккаунт и приватный набор из 10 карточек на дев-домене.
Проверяет API, ответы, PDF, S3 и фоновый ZIP; выданный PAT отзывает. Секреты не печатает.
Проверочный аккаунт и материалы остаются для диагностики; это не тест для production.
