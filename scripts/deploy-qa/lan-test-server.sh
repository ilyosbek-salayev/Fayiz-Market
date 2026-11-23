#!/usr/bin/env bash
# Isolated TEST server for a phone on the same Wi-Fi (no USB/ADB): a local Worker with its own brand-new
# database and image store on this Mac — never the production D1/R2 and no Cloudflare resources.
#   scripts/deploy-qa/lan-test-server.sh                # fresh DB in $TMPDIR/fayz-lan-test, port 8791
#   node scripts/deploy-qa/lan-seed.mjs                 # second terminal: test owner, courier, products
# Phone app → server address: http://<this Mac's Wi-Fi IP>:8791 (printed below). Stop with Ctrl+C.
# Anyone on the same Wi-Fi can reach it while it runs: use a home/office network, not public Wi-Fi.
set -euo pipefail
PORT="${QA_PORT:-8791}"
IP="${LAN_IP:-$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)}"
[ -n "$IP" ] || { echo "No Wi-Fi address found (connect the Mac to Wi-Fi or set LAN_IP)"; exit 1; }
DB_DIR="${1:-${TMPDIR:-/tmp}/fayz-lan-test}"
case "$DB_DIR" in */Fayiz-Market*|/|"$HOME") echo "Refusing DB dir inside the project or home: $DB_DIR"; exit 1;; esac
cd "$(dirname "$0")/../../apps/api"
rm -rf "$DB_DIR"
CI=1 npx wrangler d1 migrations apply fayz-market --local --persist-to "$DB_DIR" >/dev/null
echo "Fayz Market TEST server (local, isolated):  http://$IP:$PORT"
echo "Put exactly this address into the apps' test server setting. Production is not used."
# Development mode (OTP code shown on screen, mock providers) only works on a plain-http local URL.
exec npx wrangler dev --local --ip "$IP" --port "$PORT" --persist-to "$DB_DIR" \
  --var ENVIRONMENT:development --var OTP_DEV_ECHO:1 --var BOOTSTRAP_SECRET:${QA_BOOTSTRAP:-qa-bootstrap} \
  --var TELEGRAM_BOT_TOKEN:123456789:AAH-local-qa-token \
  --var PUBLIC_BASE_URL:http://$IP:$PORT --var APP_ORIGIN:http://$IP:$PORT
