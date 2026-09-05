#!/usr/bin/env bash
set -euo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
readonly DEPLOY_HOST="${DEPLOY_HOST:-myserver}"
readonly DEPLOY_DIR="/opt/sub-agent-mcp"

ssh "${DEPLOY_HOST}" "mkdir -p '${DEPLOY_DIR}'"

rsync \
  --archive \
  --delete \
  --exclude='.env' \
  --exclude='.env.production' \
  --exclude='secrets/' \
  --exclude='node_modules/' \
  --exclude='dist/' \
  --exclude='.git/' \
  "${PROJECT_DIR}/" \
  "${DEPLOY_HOST}:${DEPLOY_DIR}/"

if ssh "${DEPLOY_HOST}" "test -f '${DEPLOY_DIR}/.env.production'"; then
  ssh "${DEPLOY_HOST}" "cd '${DEPLOY_DIR}' && docker compose --env-file .env.production config --quiet"
else
  printf 'Source synchronized; create %s/.env.production before starting Compose.\n' "${DEPLOY_DIR}"
fi
