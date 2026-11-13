#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
umask 077
mkdir -p ../../.private/local-next
if [[ ! -f .env ]]; then
  {
    echo "LOCAL_UID=$(id -u)"
    echo "LOCAL_GID=$(id -g)"
    for key in LOCAL_SECRET_KEY LOCAL_DB_PASSWORD LOCAL_MEILI_KEY LOCAL_S3_PASSWORD; do
      printf '%s=%s\n' "$key" "$(openssl rand -hex 32)"
    done
  } > .env
fi
