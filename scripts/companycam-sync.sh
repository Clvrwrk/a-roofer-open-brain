#!/usr/bin/env bash
# CompanyCam mirror runner (docs/120, migration 318). READ-ONLY against CompanyCam.
#
#   bash scripts/companycam-sync.sh nightly     # incremental metadata + links + copy priority (daily)
#   bash scripts/companycam-sync.sh full        # full sweep, marks removals (weekly, Sunday)
#   bash scripts/companycam-sync.sh copy        # drain the photo copy queue, then up to 12 videos
#
# Units: deployment/remote/systemd/openbrain-companycam-{sync,copy}.{service,timer}
# on the US agent host (178.156.203.23). COMPANYCAM_ACCESS_TOKEN comes from master.env;
# Supabase vars from the repo .env, passed explicitly so a shell-exported SUPABASE_URL for
# another project can never redirect the mirror.
set -euo pipefail

MODE="${1:-nightly}"
REPO_ROOT="${COMPANYCAM_REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
export PATH="/opt/homebrew/bin:/opt/node22/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$HOME/.local/bin"

LOG_DIR="$HOME/.companycam-sync/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/companycam-$MODE.log"

cd "$REPO_ROOT"

if [ -f "$HOME/.config/cleverwork/master.env" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$HOME/.config/cleverwork/master.env"
  set +a
fi

case "$MODE" in
  nightly|full) ARGS=("$MODE") ;;
  # Per 30-min tick: photos claim for 15 min (fetch 60 s + upload 120 s caps → drained by ~18 min),
  # then videos claim for 3 min (fetch + upload capped at 4 min each → done by ~29 min), inside
  # the unit's TimeoutStartSec=1790. Display sizes for the whole queue first, then originals.
  copy) ARGS=(copy --then-originals --budget-s "${COMPANYCAM_COPY_BUDGET_S:-900}" --limit "${COMPANYCAM_COPY_LIMIT:-20000}" --concurrency "${COMPANYCAM_COPY_CONCURRENCY:-16}") ;;
  *) echo "unknown mode: $MODE" >&2; exit 2 ;;
esac

{
  echo "=== $(date '+%Y-%m-%d %H:%M:%S %z') :: companycam $MODE start ==="
  if node integrations/bridges/companycam/sync.mjs "${ARGS[@]}" --env-file "$REPO_ROOT/.env" \
     && { [ "$MODE" != copy ] || node integrations/bridges/companycam/sync.mjs copy-videos --budget-s "${COMPANYCAM_VIDEO_BUDGET_S:-180}" --limit "${COMPANYCAM_VIDEO_LIMIT:-12}" --env-file "$REPO_ROOT/.env"; }; then
    echo "=== $(date '+%Y-%m-%d %H:%M:%S %z') :: done OK ==="
  else
    rc=$?
    echo "=== $(date '+%Y-%m-%d %H:%M:%S %z') :: FAILED (exit $rc) ==="
    exit "$rc"
  fi
  echo
} >>"$LOG_FILE" 2>&1
