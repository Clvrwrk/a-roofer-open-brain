#!/usr/bin/env bash
# CompanyCam mirror runner (docs/120, migration 318). READ-ONLY against CompanyCam.
#
#   bash scripts/companycam-sync.sh nightly     # incremental metadata + links + copy priority (daily)
#   bash scripts/companycam-sync.sh full        # full sweep, marks removals (weekly, Sunday)
#   bash scripts/companycam-sync.sh copy        # drain the photo copy queue for up to ~25 min
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
  # ~25 min of copying per 30-min timer tick: 6 workers, open jobs first, whole queue in order.
  copy) ARGS=(copy --limit "${COMPANYCAM_COPY_LIMIT:-6000}" --concurrency "${COMPANYCAM_COPY_CONCURRENCY:-6}") ;;
  *) echo "unknown mode: $MODE" >&2; exit 2 ;;
esac

{
  echo "=== $(date '+%Y-%m-%d %H:%M:%S %z') :: companycam $MODE start ==="
  if node integrations/bridges/companycam/sync.mjs "${ARGS[@]}" --env-file "$REPO_ROOT/.env"; then
    echo "=== $(date '+%Y-%m-%d %H:%M:%S %z') :: done OK ==="
  else
    rc=$?
    echo "=== $(date '+%Y-%m-%d %H:%M:%S %z') :: FAILED (exit $rc) ==="
    exit "$rc"
  fi
  echo
} >>"$LOG_FILE" 2>&1
