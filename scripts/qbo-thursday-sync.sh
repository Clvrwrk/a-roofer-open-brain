#!/usr/bin/env bash
# Thursday QBO → Supabase mirror refresh (PEC-102 / docs/76).
# READ-ONLY against production QuickBooks. Never writes to QBO.
#
#   bash scripts/qbo-thursday-sync.sh
#
# Cron (Thu 20:00 America/Chicago):
#   0 20 * * 4 TZ="America/Chicago" /usr/bin/env bash /opt/openbrain/a-roofers-open-brain/scripts/qbo-thursday-sync.sh
set -euo pipefail

REPO_ROOT="${QBO_SYNC_REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
export PATH="/opt/homebrew/bin:/opt/node22/bin:/usr/local/bin:/usr/bin:/bin:$HOME/.local/bin:$PATH"

LOG_DIR="$HOME/.qbo-sync/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/qbo-thursday.log"

cd "$REPO_ROOT"

# Prefer Cleverwork master.env for QBO prod tokens; repo .env for Supabase.
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

export QUICKBOOKS_ACCESS_MODE="${QUICKBOOKS_ACCESS_MODE:-read_only}"
export QUICKBOOKS_WRITE_ENABLED="${QUICKBOOKS_WRITE_ENABLED:-false}"
export QUICKBOOKS_SANDBOX_MODE=false
export QUICKBOOKS_ENV=production

{
  echo "=== $(date '+%Y-%m-%d %H:%M:%S %z') :: qbo thursday sync start ==="
  if node integrations/bridges/quickbooks/mirror-backfill.mjs --mode=thursday; then
    echo "=== $(date '+%Y-%m-%d %H:%M:%S %z') :: done OK ==="
  else
    echo "=== $(date '+%Y-%m-%d %H:%M:%S %z') :: FAILED (exit $?) ==="
    exit 1
  fi
  echo
} >>"$LOG_FILE" 2>&1
