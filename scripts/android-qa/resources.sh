#!/usr/bin/env bash
# Samples the Mac while a QA run uses the emulator (canonical copy: Fayz repo scripts/android-qa/resources.sh): qemu RSS/CPU, free memory %, swap, disk free.
#   qa-resources <out.csv> [interval_s=10]      (stop with Ctrl-C / kill; then: qa-resources --summary <out.csv>)
set -uo pipefail
if [ "${1:-}" = "--summary" ]; then
  awk -F, 'NR>1{n++; r+=$2; if($2>rm)rm=$2; c+=$3; if($3>cm)cm=$3; if(min==""||$4<min)min=$4; if($5>sw)sw=$5; d=$6}
    END{if(!n){print "no samples"; exit} printf "samples %d · qemu RSS avg %.0f MB, max %.0f MB · qemu CPU avg %.0f%%, max %.0f%% (100%% = 1 core of 10) · Mac free memory min %d%% · swap max %.0f MB · disk free %s\n", n, r/n, rm, c/n, cm, min, sw, d}' "$2"
  exit 0
fi
OUT="${1:?usage: qa-resources <out.csv> [interval]}"; IV="${2:-10}"
echo "time,qemu_rss_mb,qemu_cpu_pct,mac_free_mem_pct,swap_used_mb,disk_free" > "$OUT"
while :; do
  q=$(ps -axo rss,%cpu,command | awk '/qemu-system/ && !/awk/{r+=$1; c+=$2} END{printf "%.0f,%.1f", r/1024, c}')
  f=$(memory_pressure 2>/dev/null | awk -F': ' '/free percentage/{gsub("%","",$2); print $2}')
  s=$(sysctl -n vm.swapusage | awk '{for(i=1;i<=NF;i++) if($i=="used"){v=$(i+2); sub("M","",v); print v}}')
  d=$(df -h /System/Volumes/Data | awk 'NR==2{print $4}')
  echo "$(date +%H:%M:%S),${q:-0,0},${f:-0},${s:-0},$d" >> "$OUT"
  sleep "$IV"
done
