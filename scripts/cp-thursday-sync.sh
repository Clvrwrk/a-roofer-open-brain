#!/usr/bin/env bash
# Thursday CenterPoint → Supabase mirror refresh (PEC-110 / docs/78).
# READ-ONLY against CenterPoint. Never writes to CenterPoint.
#
#   bash scripts/cp-thursday-sync.sh
#
# Cron (Thu 20:30 America/Chicago — after QBO at 20:00):
#   30 20 * * 4 TZ="America/Chicago" /usr/bin/env bash /opt/openbrain/a-roofers-open-brain/scripts/cp-thursday-sync.sh
set -euo pipefail

REPO_ROOT="${CP_SYNC_REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
export PATH="/opt/homebrew/bin:/opt/node22/bin:/usr/local/bin:/usr/bin:/bin:$HOME/.local/bin:$PATH"

LOG_DIR="$HOME/.cp-sync/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/cp-thursday.log"

cd "$REPO_ROOT"

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
  echo "=== $(date '+%Y-%m-%d %H:%M:%S %z') :: centerpoint thursday sync start ==="
  if node integrations/bridges/centerpoint/mirror-backfill.mjs --mode=backfill; then
    echo "=== $(date '+%Y-%m-%d %H:%M:%S %z') :: done OK ==="
  else
    echo "=== $(date '+%Y-%m-%d %H:%M:%S %z') :: FAILED (exit $?) ==="
    exit 1
  fi
  echo
} >>"$LOG_FILE" 2>&1
