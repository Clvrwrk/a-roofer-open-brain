#!/usr/bin/env bash
# ABC Supply sync runner.
#
#   bash scripts/abc-nightly-sync.sh            # nightly cycle-counting run (default)
#   bash scripts/abc-nightly-sync.sh full       # full sweep: accounts + branches + ALL catalog
#
# Nightly (cycle counting): recomputes the review schedule from the purchase ledger, then refreshes
# only the catalog items whose review is due (weekly A / monthly B / quarterly C / annual D).
# Fast and cheap because dormant items (~99.5% of the catalog) are never touched.
#
# full: the annual baseline sweep. Pulls every catalog item (~331k / ~90 min) plus accounts and
# branches. Run once to establish the content_hash baseline, then on an annual cadence (or ad hoc).
#
# Both are change-gated (content_hash) and archive real changes to public.abc_change_log.
# cron runs with a minimal environment, so PATH and an absolute repo root are set explicitly.
# Output is logged OUTSIDE the repo so it never dirties git. Credentials come from repo-root .env.
#
# Cron (nightly cycle counting, 3:30 AM ET, DST-aware):
#   30 3 * * *  TZ="America/New_York" /usr/bin/env bash /Users/chussey/Documents/a-roofers-open-brain/scripts/abc-nightly-sync.sh
# Cron (annual full sweep, e.g. 2:00 AM ET on Jan 2):
#   0 2 2 1 *   TZ="America/New_York" /usr/bin/env bash /Users/chussey/Documents/a-roofers-open-brain/scripts/abc-nightly-sync.sh full
set -euo pipefail

MODE="${1:-nightly}"
REPO_ROOT="/Users/chussey/Documents/a-roofers-open-brain"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$HOME/.local/bin"

LOG_DIR="$HOME/.abc-sync/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/abc-sync.log"

cd "$REPO_ROOT"

if [ "$MODE" = "full" ]; then
  SYNC_ARGS="--skip-audit --compact"
  LABEL="full sweep (accounts + branches + catalog)"
else
  SYNC_ARGS="--review-due --compact"
  LABEL="nightly cycle-counting (recompute + due items)"
fi

# Sentry (optional): if @sentry/node is installed under the command-center app and the repo-root
# .env carries a SENTRY_DSN, load the instrument before the sync so failures report to Sentry
# (component=abc-sync). Until then this is a no-op and the sync runs exactly as before.
SENTRY_INSTRUMENT="$REPO_ROOT/app/command-center/runtime/sentry-instrument.mjs"
SENTRY_IMPORT=""
if [ -d "$REPO_ROOT/app/command-center/node_modules/@sentry/node" ] && [ -f "$SENTRY_INSTRUMENT" ]; then
  # Export SENTRY_* from repo-root .env so the --import instrument (runs before the script) sees them.
  if [ -f "$REPO_ROOT/.env" ]; then
    set -a; eval "$(grep -E '^SENTRY_(DSN|ENVIRONMENT|RELEASE)=' "$REPO_ROOT/.env" || true)"; set +a
  fi
  export SENTRY_COMPONENT="abc-sync"
  [ -n "${SENTRY_DSN:-}" ] && SENTRY_IMPORT="--import $SENTRY_INSTRUMENT"
fi

{
  echo "=== $(date '+%Y-%m-%d %H:%M:%S %z') :: abc sync start [$LABEL] ==="
  if node $SENTRY_IMPORT integrations/bridges/abc-supply/production-sync.mjs $SYNC_ARGS; then
    echo "=== $(date '+%Y-%m-%d %H:%M:%S %z') :: done OK ==="
  else
    echo "=== $(date '+%Y-%m-%d %H:%M:%S %z') :: FAILED (exit $?) ==="
  fi
  echo
} >>"$LOG_FILE" 2>&1
