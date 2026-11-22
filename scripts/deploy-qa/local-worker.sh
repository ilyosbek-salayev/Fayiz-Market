#!/usr/bin/env bash
# Starts an ISOLATED local Worker for QA on port 8788 with a brand-new database in $1 (default /tmp/fayz-qa-expansion).
# Development-only settings (OTP echo, a fake Telegram bot token) exist only here — never in production.
set -euo pipefail
DB_DIR="${1:-/tmp/fayz-qa-expansion}"
cd "$(dirname "$0")/../../apps/api"
rm -rf "$DB_DIR"
CI=1 npx wrangler d1 migrations apply fayz-market --local --persist-to "$DB_DIR" >/dev/null
exec npx wrangler dev --local --ip 127.0.0.1 --port 8788 --persist-to "$DB_DIR" \
  --var ENVIRONMENT:development --var OTP_DEV_ECHO:1 --var BOOTSTRAP_SECRET:qa-bootstrap \
  --var TELEGRAM_BOT_TOKEN:123456789:AAH-local-qa-token \
  --var PUBLIC_BASE_URL:http://127.0.0.1:8788 --var APP_ORIGIN:http://127.0.0.1:8788
