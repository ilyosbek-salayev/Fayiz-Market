#!/usr/bin/env bash
# Fayz Market — Android QA control. Emulator-first; every suite uses its own fresh local Worker (D1 + R2), production
# is never written. Runs from any directory.
#
#   Emulator   qa.sh emulator start [--window] | stop | status | unlock   AVD $QA_AVD (default qa-android16)
#              qa.sh setup                     PIN 1111 + virtual fingerprint + animations off (emulator only)
#              qa.sh target                    names the device the suites will use; refuses a physical phone
#   Build      qa.sh build                     web bundles + debug/release APKs → dist/apk/v<version>
#              qa.sh install [debug|release]   adb install -r (no uninstall, data kept) on the QA emulator
#   Suites     qa.sh e2e | plan | native | maestro | uiautomator | web | release-check
#              qa.sh regression [--resume]     every suite in order; --resume continues an interrupted run
#   Evidence   qa.sh screenshot <name>         emulator screen → docs/v1/screenshots/emulator-android16/manual/
#              qa.sh resources start|stop|summary   Mac RAM/CPU/SSD while the emulator runs (.local-qa/resources/)
#   Toolchain  qa.sh toolchain-sync            installs emulator.sh / resources.sh as ~/.fayz-toolchain/bin/qa-*
#
# Device safety: the suites only ever get the serial of the running QA emulator (resolved by AVD name and checked
# with ro.kernel.qemu), even when the owner's Samsung is plugged in. Phone scripts need REAL_DEVICE_CONFIRM=<serial>.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"; cd "$ROOT"
TOOLCHAIN="${FAYZ_TOOLCHAIN:-$HOME/.fayz-toolchain}"
[ -f "$TOOLCHAIN/env.sh" ] || { echo "toolchain missing: $TOOLCHAIN/env.sh (see docs/v1/QA_ANDROID.md)" >&2; exit 2; }
source "$TOOLCHAIN/env.sh"
AVD="${QA_AVD:-qa-android16}"; export QA_AVD="$AVD"
VERSION="$(node -p "require('./package.json').version")"
LOCAL="$ROOT/.local-qa"; EVID="docs/v1/evidence/emulator-android16"; SHOTS="docs/v1/screenshots/emulator-android16"
mkdir -p "$LOCAL"
emu() { "$HERE/emulator.sh" "$@"; }
say() { printf '\n\033[1m== %s\033[0m\n' "$*"; }

# The running QA emulator becomes ANDROID_SERIAL; it is started (or restarted after a crash) when needed.
use_emulator() {
  local s; s="$(emu serial)"
  if [ -z "$s" ]; then emu start >/dev/null || { echo "could not start $AVD" >&2; return 1; }; s="$(emu serial)"; fi
  [ -n "$s" ] || { echo "$AVD is not running" >&2; return 1; }
  if [ "$(adb -s "$s" shell getprop ro.kernel.qemu | tr -d '\r')" != 1 ]; then echo "TARGET REFUSED — $s is not an emulator" >&2; return 1; fi
  emu unlock >/dev/null 2>&1 || true
  export ANDROID_SERIAL="$s"
  echo "TARGET $s · EMULATOR $AVD · Android $(adb -s "$s" shell getprop ro.build.version.release | tr -d '\r')"
  local phones; phones="$(adb devices | awk 'NR>1 && $2=="device" && $1 !~ /^emulator-/{print $1}' | tr '\n' ' ')"
  [ -n "$phones" ] && echo "note: physical device(s) also connected and NOT used: $phones"
  return 0
}
install_apks() { # debug | release
  local kind="${1:-debug}" c a
  if [ "$kind" = release ]; then c="dist/apk/v$VERSION/fayz-market-customer.apk"; a="dist/apk/v$VERSION/fayz-market-admin.apk"
  else c="apps/android/customer/build/outputs/apk/debug/customer-debug.apk"; a="apps/android/admin/build/outputs/apk/debug/admin-debug.apk"; fi
  for f in "$c" "$a"; do [ -s "$f" ] || { echo "missing $f — run: qa.sh build" >&2; return 1; }; done
  use_emulator || return 1
  adb install -r "$c" | tail -1 && adb install -r "$a" | tail -1
}
with_worker() { # runs "$@" while an isolated local Worker listens on $QA_PORT (fresh D1 in .local-qa/tmp)
  local port="${QA_PORT:-8791}" dir; mkdir -p "$LOCAL/tmp"; dir="$(mktemp -d "$LOCAL/tmp/worker-XXXX")"
  QA_PORT="$port" bash scripts/deploy-qa/local-worker.sh "$dir/db" >"$dir/worker.log" 2>&1 &
  for _ in $(seq 1 240); do curl -sf "http://127.0.0.1:$port/health" >/dev/null && break; sleep 0.5; done
  "$@"; local rc=$?
  pkill -f "wrangler dev --local --ip 127.0.0.1 --port $port" 2>/dev/null; sleep 1; rm -rf "$dir"
  return $rc
}
web_suite() {
  ( env -u VITE_API_URL npm run build -w @fayz/customer >/dev/null && env -u VITE_API_URL npm run build -w @fayz/admin >/dev/null ) || return 1
  mkdir -p "$EVID/regression"
  local tc vt; npm run typecheck > "$LOCAL/typecheck.log" 2>&1; tc=$?; npx vitest run > "$LOCAL/vitest.log" 2>&1; vt=$?
  { echo "typecheck exit $tc"; tail -3 "$LOCAL/typecheck.log"; echo "unit (vitest) exit $vt"; tail -6 "$LOCAL/vitest.log"; } | tee "$EVID/regression/typecheck-unit.txt"
  [ "$tc" = 0 ] && [ "$vt" = 0 ] || return 1
  SHOTS="$SHOTS/regression-chrome" EVIDENCE="$EVID/regression" node scripts/ui-qa/real-device-fixes-ui.mjs
}
release_suite() {
  install_apks debug || return 1   # the check installs the release over a debug build pointed at a test server
  SHOTS="$SHOTS/release-$VERSION" node scripts/android-qa/release-apk-check.mjs "dist/apk/v$VERSION"; local rc=$?
  cp "$SHOTS/release-$VERSION/release-apk-results.txt" "$EVID/release-$VERSION-over-debug.txt" 2>/dev/null
  install_apks debug >/dev/null   # leave the emulator ready for the next QA run
  return $rc
}
run_suite() {
  case "$1" in
    install) install_apks debug ;;
    e2e) use_emulator && node scripts/android-qa/real-device-e2e.mjs ;;
    plan) use_emulator && node scripts/android-qa/emulator-plan-qa.mjs ;;
    native) use_emulator && SHOTS="$SHOTS/native" with_worker bash -c "set -o pipefail; node scripts/android-qa/native-qa.mjs | tee $EVID/native-qa.txt" ;;
    maestro) use_emulator && node scripts/android-qa/maestro-local.mjs ;;
    uiautomator) use_emulator && node scripts/android-qa/uiautomator-qa.mjs ;;
    web) web_suite ;;
    release-check) release_suite ;;
    *) echo "unknown suite $1" >&2; return 2 ;;
  esac
}
SUITES="install e2e plan native maestro uiautomator web release-check"

regression() {
  local state="$LOCAL/state/regression-$VERSION.state" head; head="$(git rev-parse --short HEAD)$(git diff --quiet HEAD -- apps packages || echo '+dirty')"
  mkdir -p "$LOCAL/state"
  if [ "${1:-}" = --resume ] && [ -f "$state" ]; then
    local was; was="$(awk '/^# head /{print $3}' "$state")"
    [ "$was" = "$head" ] || echo "note: resuming a run started at $was, code is now $head"
    say "resuming regression $VERSION ($(grep -c ' PASS ' "$state") suite(s) already passed)"
  else
    printf '# regression %s\n# head %s\n# started %s\n' "$VERSION" "$head" "$(date '+%F %T')" > "$state"
  fi
  local run; run="$(date +%Y%m%d-%H%M%S)"; mkdir -p "$LOCAL/logs/regression-$run" "$LOCAL/resources"
  "$HERE/resources.sh" "$LOCAL/resources/regression-$run.csv" 10 & local rpid=$!
  for suite in $SUITES; do
    if grep -q "^$suite PASS " "$state"; then echo "skip $suite (PASS earlier)"; continue; fi
    say "$suite"; local t0; t0=$(date +%s)
    if run_suite "$suite" 2>&1 | tee "$LOCAL/logs/regression-$run/$suite.log"; [ "${PIPESTATUS[0]}" = 0 ]; then st=PASS; else st=FAIL; fi
    sed -i '' "/^$suite /d" "$state"; echo "$suite $st $(( $(date +%s) - t0 ))s $(date '+%T')" >> "$state"
    echo "→ $suite $st"
  done
  { kill "$rpid" && wait "$rpid"; } 2>/dev/null
  local out="$EVID/regression-$VERSION.txt"
  {
    echo "Fayz Market $VERSION — Android QA regression on the EMULATOR ($AVD; NOT a physical phone). Local Workers only."
    echo "code $head · finished $(date '+%F %T')"
    echo; grep -v '^#' "$state" | awk '{printf "%-14s %-5s %s\n", $1, $2, $3}'
    echo; echo "APKs (sha256):"
    for f in dist/apk/v$VERSION/*.apk apps/android/*/build/outputs/apk/debug/*-debug.apk; do [ -f "$f" ] && echo "  $(shasum -a 256 "$f" | cut -c1-64)  $f"; done
    echo; echo "Mac resources during this run: $("$HERE/resources.sh" --summary "$LOCAL/resources/regression-$run.csv")"
  } > "$out"
  cat "$out"
  ! grep -qE '^[a-z-]+ FAIL ' "$state"
}

cmd="${1:-help}"; shift || true
case "$cmd" in
  emulator) emu "$@" ;;
  target) use_emulator ;;
  setup) use_emulator && node scripts/android-qa/setup-emulator.mjs ;;
  build) env -u VITE_API_URL npm run build:apks ;;
  install) install_apks "${1:-debug}" ;;
  e2e|plan|native|maestro|uiautomator|web|release-check) run_suite "$cmd" ;;
  regression) regression "$@" ;;
  screenshot) use_emulator >/dev/null && mkdir -p "$SHOTS/manual" && adb exec-out screencap -p > "$SHOTS/manual/${1:?name}.png" && echo "$SHOTS/manual/$1.png" ;;
  resources)
    mkdir -p "$LOCAL/resources"
    case "${1:-summary}" in
      start) f="$LOCAL/resources/$(date +%Y%m%d-%H%M%S).csv"; nohup "$HERE/resources.sh" "$f" 10 >/dev/null 2>&1 & echo $! > "$LOCAL/resources/pid"; echo "sampling → $f" ;;
      stop) [ -f "$LOCAL/resources/pid" ] && kill "$(cat "$LOCAL/resources/pid")" 2>/dev/null; rm -f "$LOCAL/resources/pid"; echo stopped ;;
      summary) f="$(ls -t "$LOCAL"/resources/*.csv 2>/dev/null | head -1)"; [ -n "$f" ] && "$HERE/resources.sh" --summary "$f" || echo "no samples yet" ;;
    esac ;;
  toolchain-sync) mkdir -p "$TOOLCHAIN/bin" && cp "$HERE/emulator.sh" "$TOOLCHAIN/bin/qa-emulator" && cp "$HERE/resources.sh" "$TOOLCHAIN/bin/qa-resources" && chmod +x "$TOOLCHAIN/bin/qa-"* && echo "installed qa-emulator, qa-resources into $TOOLCHAIN/bin" ;;
  *) sed -n 2,18p "$HERE/qa.sh" ;;
esac
