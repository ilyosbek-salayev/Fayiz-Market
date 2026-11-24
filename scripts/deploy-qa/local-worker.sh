#!/usr/bin/env bash
# Starts an ISOLATED local Worker for QA with a brand-new database in $1 (default /tmp/fayz-qa-expansion).
# Port: $QA_PORT (default 8788). Optional $QA_ENV_FILE adds provider settings for local test mode
# (scripts/deploy-qa/provider-test-mode.mjs writes one that points every provider at a local mock).
# Development-only settings (OTP echo, a fake Telegram bot token, mock providers) exist only here — never in
# production: the Worker honours them only with ENVIRONMENT=development on a plain-http local URL.
set -euo pipefail
DB_DIR="${1:-/tmp/fayz-qa-expansion}"
PORT="${QA_PORT:-8788}"
cd "$(dirname "$0")/../../apps/api"
# Never delete a caller-supplied path. Each QA run must use a new directory.
if [ -e "$DB_DIR" ]; then
  echo 'QA database path already exists; choose a fresh directory.' >&2
  exit 1
fi
mkdir -p "$DB_DIR"
CI=1 npx wrangler d1 migrations apply fayz-market --local --persist-to "$DB_DIR" >/dev/null
EXTRA=()
if [ -n "${QA_ENV_FILE:-}" ]; then EXTRA+=(--env-file "$QA_ENV_FILE"); fi
exec npx wrangler dev --local --ip 127.0.0.1 --port "$PORT" --inspector-port 0 --persist-to "$DB_DIR" ${EXTRA[@]+"${EXTRA[@]}"} \
  --var ENVIRONMENT:development --var OTP_DEV_ECHO:${QA_OTP_ECHO:-1} --var BOOTSTRAP_SECRET:${QA_BOOTSTRAP:-qa-bootstrap} \
  --var TELEGRAM_BOT_TOKEN:123456789:AAH-local-qa-token \
  --var PUBLIC_BASE_URL:http://127.0.0.1:$PORT --var APP_ORIGIN:http://127.0.0.1:$PORT
