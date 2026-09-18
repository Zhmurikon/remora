#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Только выделенный каталог Remora; чужие приложения не затрагиваются.
ssh home-server 'mkdir -p /opt/remora-releases && chmod 700 /opt/remora-releases && if test -d /opt/remora-dev; then tar --exclude=node_modules --exclude=.pnpm-store --exclude=.venv --exclude=.next --exclude=dist --exclude=.env --exclude=".env.*" --exclude=.private --exclude=backups --exclude=__pycache__ -czf /opt/remora-releases/source-$(date -u +%Y%m%dT%H%M%SZ).tar.gz -C /opt/remora-dev .; fi'
rsync -az --exclude=.git --exclude=.private --exclude=.env --exclude='.env.*' \
  --exclude=node_modules --exclude=.pnpm-store --exclude=.venv --exclude=.next --exclude=dist \
  --exclude=__pycache__ --exclude=.mypy_cache --exclude=.pytest_cache \
  --exclude=.ruff_cache --exclude='*.tsbuildinfo' --exclude=deploy/backups \
  --exclude=.update.lock ./ home-server:/opt/remora-dev/
rsync -az deploy/.env.example home-server:/opt/remora-dev/deploy/.env.example
ssh home-server 'cd /opt/remora-dev && bash deploy/update.sh'
