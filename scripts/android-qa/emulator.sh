#!/usr/bin/env bash
# Persistent Android QA emulator for this Mac (Apple Silicon, HVF). Reusable for any mobile project.
# CANONICAL COPY lives in the Fayz Market repo (scripts/android-qa/emulator.sh); `scripts/android-qa/qa.sh toolchain-sync`
# installs it as ~/.fayz-toolchain/bin/qa-emulator for other projects.
#   qa-emulator start [--window]            boot (headless by default). Always a clean cold boot (~15 s): installed
#                                            apps, PIN, fingerprint and settings live on the data disk and persist;
#                                            quick-boot snapshots are off (one failed to restore; 4 GB each)
# GPU: gfxstream + guest ANGLE → Vulkan → Metal (OpenGL ES 3.1, hardware). Plain `-gpu host` gives only GLES 3.0 on macOS.
#   qa-emulator stop                         shut down cleanly (waits until the emulator process exits)
#   qa-emulator status                       device, Android version, accel/GPU, Mac RAM/CPU/disk use
#   qa-emulator unlock                       wake + PIN 1111 (QA AVDs only) + home screen
#   qa-emulator serial                       prints the adb serial of the running AVD (nothing if not running)
# AVD: $QA_AVD (default qa-android16 — Android 16, arm64, 4 GB RAM, 4 vCPU). Watch it with scrcpy or --window.
set -euo pipefail
source "${FAYZ_TOOLCHAIN:-$HOME/.fayz-toolchain}/env.sh"
AVD="${QA_AVD:-qa-android16}"
LOGDIR="$FAYZ_TOOLCHAIN/logs"; mkdir -p "$LOGDIR"
LOG="$LOGDIR/emulator-$AVD.log"

serial_of() { # the emulator-NNNN serial running this AVD, if any
  for s in $(adb devices | awk '/^emulator-[0-9]+[[:space:]]+device$/{print $1}'); do
    [ "$(adb -s "$s" emu avd name 2>/dev/null | head -1 | tr -d '\r')" = "$1" ] && { echo "$s"; return; }
  done
}
wait_boot() {
  local s="$1"
  adb -s "$s" wait-for-device
  for _ in $(seq 1 240); do [ "$(adb -s "$s" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ] && return 0; sleep 1; done
  echo "boot timed out (see $LOG)" >&2; return 1
}
unlock() {
  local s="$1"
  # After boot the keyguard appears a moment later; QA AVDs use PIN 1111 (set by scripts/android-qa/setup-emulator.mjs).
  for _ in 1 2 3 4 5 6; do
    adb -s "$s" shell input keyevent KEYCODE_WAKEUP
    if adb -s "$s" shell dumpsys window | grep -q 'isKeyguardShowing=true'; then
      adb -s "$s" shell input swipe 540 1900 540 500 250; sleep 1
      adb -s "$s" shell input text 1111; adb -s "$s" shell input keyevent KEYCODE_ENTER; sleep 2
    else
      sleep 2; adb -s "$s" shell dumpsys window | grep -q 'isKeyguardShowing=true' || break
    fi
  done
  adb -s "$s" shell wm dismiss-keyguard >/dev/null 2>&1 || true
  adb -s "$s" shell input keyevent KEYCODE_HOME
}
qemu_pid() { pgrep -f "qemu-system.*-avd $1( |$)" | head -1; }
wait_exit() { for _ in $(seq 1 180); do [ -z "$(qemu_pid "$1")" ] && return 0; sleep 1; done; echo "emulator still running after 180 s" >&2; return 1; }

cmd="${1:-status}"; shift || true
case "$cmd" in
  start)
    WINDOW=0
    for a in "$@"; do case "$a" in --window) WINDOW=1;; esac; done
    s="$(serial_of "$AVD")"
    if [ -n "$s" ]; then echo "$AVD already running as $s"; wait_boot "$s"; unlock "$s"; exit 0; fi
    # A previous instance may still be writing its quick-boot snapshot: let it finish first.
    if [ -n "$(qemu_pid "$AVD")" ]; then echo "waiting for the previous $AVD process to exit"; wait_exit "$AVD" || exit 1; fi
    ARGS=(-avd "$AVD" -no-snapshot -no-audio -no-boot-anim -gpu host -feature GuestAngle -netdelay none -netspeed full)
    [ "$WINDOW" = 0 ] && ARGS+=(-no-window)
    echo "starting $AVD (${ARGS[*]}) — log $LOG"
    nohup emulator "${ARGS[@]}" >"$LOG" 2>&1 &
    for _ in $(seq 1 60); do s="$(serial_of "$AVD")"; [ -n "$s" ] && break; sleep 2; done
    [ -n "$s" ] || { echo "emulator did not register with adb (see $LOG)" >&2; exit 1; }
    wait_boot "$s"; unlock "$s"
    echo "ready: $s  (export ANDROID_SERIAL=$s)";;
  stop)
    s="$(serial_of "$AVD")"
    if [ -z "$s" ] && [ -z "$(qemu_pid "$AVD")" ]; then echo "$AVD is not running"; exit 0; fi
    echo "stopping $AVD (clean Android shutdown) ..."
    # `emu kill` alone is a power cut: without snapshots, writes Android still holds in memory (a fresh APK install)
    # are lost. Flush, power off from inside Android, and only then fall back to killing the process.
    if [ -n "$s" ]; then adb -s "$s" shell sync >/dev/null 2>&1 || true; adb -s "$s" shell reboot -p >/dev/null 2>&1 || true; fi
    for _ in $(seq 1 60); do [ -z "$(qemu_pid "$AVD")" ] && break; sleep 1; done
    if [ -n "$(qemu_pid "$AVD")" ]; then s="$(serial_of "$AVD")"; [ -n "$s" ] && adb -s "$s" emu kill >/dev/null 2>&1 || kill "$(qemu_pid "$AVD")" 2>/dev/null || true; fi
    wait_exit "$AVD" && echo "stopped $AVD";;
  serial)
    serial_of "$AVD";;
  unlock)
    s="$(serial_of "$AVD")"; [ -n "$s" ] || { echo "$AVD is not running" >&2; exit 1; }; unlock "$s"; echo unlocked;;
  status)
    s="$(serial_of "$AVD")"
    if [ -n "$s" ]; then
      echo "device:   $s  Android $(adb -s "$s" shell getprop ro.build.version.release | tr -d '\r') (API $(adb -s "$s" shell getprop ro.build.version.sdk | tr -d '\r')), $(adb -s "$s" shell getprop ro.product.cpu.abi | tr -d '\r'), boot_completed=$(adb -s "$s" shell getprop sys.boot_completed | tr -d '\r')"
      echo "screen:   $(adb -s "$s" shell wm size | tail -1 | tr -d '\r'), $(adb -s "$s" shell wm density | tail -1 | tr -d '\r')"
      echo "guest:    $(adb -s "$s" shell cat /proc/meminfo | awk '/MemTotal|MemAvailable/{printf "%s %d MB  ", $1, $2/1024}')cpus=$(adb -s "$s" shell nproc | tr -d '\r')"
      echo "renderer: $(adb -s "$s" shell dumpsys SurfaceFlinger 2>/dev/null | grep -m1 'GLES:' | tr -d '\r')"
    else echo "device:   $AVD not running"; fi
    echo "accel:    $(emulator -accel-check 2>&1 | grep -m1 -i hypervisor || echo unknown)"
    ps -axo pid,rss,%cpu,command | awk -v avd="$AVD" '/qemu-system/ && $0 ~ avd {printf "host:     qemu pid %s  RSS %.0f MB  CPU %s%%\n", $1, $2/1024, $3}'
    echo "disk:     AVD $(du -sh "$ANDROID_AVD_HOME/$AVD.avd" 2>/dev/null | cut -f1), toolchain $(du -sh "$FAYZ_TOOLCHAIN" | cut -f1), Mac free $(df -h /System/Volumes/Data | awk 'NR==2{print $4}')"
    echo "mac:      $(memory_pressure | tail -1)";;
  *) sed -n 2,13p "$0"; exit 2;;
esac
