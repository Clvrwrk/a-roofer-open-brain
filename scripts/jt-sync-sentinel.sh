#!/usr/bin/env bash
# JT Sync Sentinel daily runner (docs/80, proposals/2026-08-05-jt-sync-sentinel.md).
# READ-ONLY against JobTread; mutations only via executor.mjs on approved rows.
#
#   bash scripts/jt-sync-sentinel.sh            # daily sweep + drift + report
#   bash scripts/jt-sync-sentinel.sh smoke      # auth + webhook inventory only
#
# Cron (10:00 America/Los_Angeles, DST-aware — US agent host 178.156.203.23):
#   0 10 * * * TZ="America/Los_Angeles" /usr/bin/env bash /opt/openbrain/a-roofers-open-brain/scripts/jt-sync-sentinel.sh
# Preferred: systemd units deployment/remote/systemd/openbrain-jt-sentinel.{service,timer}
set -euo pipefail

MODE="${1:-daily}"
REPO_ROOT="${JT_SENTINEL_REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
export PATH="/opt/homebrew/bin:/opt/node22/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$HOME/.local/bin"

LOG_DIR="$HOME/.jt-sentinel/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/jt-sentinel.log"

cd "$REPO_ROOT"

# Cleverwork master.env carries JT_SUPABASE_MIRROR_GRANT_KEY + SUPABASE_ACCESS_TOKEN
# (+ optional SLACK_BOT_TOKEN); repo .env may add Supabase vars on the agent host.
if [ -f "$HOME/.config/cleverwork/master.env" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$HOME/.config/cleverwork/master.env"
  set +a
fi
if [ -f "$REPO_ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$REPO_ROOT/.env"
  set +a
fi

{
  echo "=== $(date '+%Y-%m-%d %H:%M:%S %z') :: jt sync sentinel start (mode=$MODE) ==="
  if node integrations/bridges/jobtread/sync-sentinel/sentinel.mjs --mode="$MODE"; then
    echo "=== $(date '+%Y-%m-%d %H:%M:%S %z') :: done OK ==="
  else
    echo "=== $(date '+%Y-%m-%d %H:%M:%S %z') :: FAILED (exit $?) ==="
    exit 1
  fi
  echo
} >>"$LOG_FILE" 2>&1
