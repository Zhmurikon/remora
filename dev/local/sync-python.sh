#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
./dev/local/init.sh
docker volume create zapominalnya-local_python-deps > /dev/null
docker run --rm -v zapominalnya-local_python-deps:/opt/venv remora-dev-api:local \
  chown "$(id -u):$(id -g)" /opt/venv
mkdir -p "${XDG_CACHE_HOME:-$HOME/.cache}/uv"
docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp -e UV_CACHE_DIR=/cache \
  -v "${XDG_CACHE_HOME:-$HOME/.cache}/uv:/cache" \
  -v zapominalnya-local_python-deps:/opt/venv \
  -v "$PWD/apps/api/pyproject.toml:/workspace/apps/api/pyproject.toml:ro" \
  -v "$PWD/integrations/remora-ai-integrations/mcp-server:/workspace/integrations/remora-ai-integrations/mcp-server:ro" \
  -v "$PWD/apps/api/uv.lock:/workspace/apps/api/uv.lock:ro" \
  remora-dev-api:local uv sync --frozen --no-install-project
