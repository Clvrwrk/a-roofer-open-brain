#!/usr/bin/env bash
# uptime-check.sh — DevTeam uptime monitor (no_agent cron). stdout empty = healthy.
# Referenced by dev-team-architecture.yaml uptime_monitor heartbeat.
set -euo pipefail

FAIL=0
check() {
  local name="$1" url="$2" max_ms="${3:-10000}"
  local start end ms code
  start=$(date +%s%3N)
  code=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 15 "$url" 2>/dev/null || echo "000")
  end=$(date +%s%3N)
  ms=$((end - start))
  if [ "$code" != "200" ] || [ "$ms" -gt "$max_ms" ]; then
    echo "DOWN ${name} code=${code} ms=${ms} url=${url}"
    FAIL=1
  fi
}

check "command-center" "https://cc.proexteriorsus.net/healthz" 10000
check "kasm" "https://desktops.proexteriorsus.net" 15000
check "supabase" "https://rnhmvcpsvtqjlffpsayu.supabase.co/rest/v1/" 10000

if [ "$FAIL" -ne 0 ]; then
  exit 1
fi
# Silent success — cron deliver only on non-empty stdout
