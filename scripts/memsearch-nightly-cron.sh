#!/usr/bin/env bash
# Nightly MemSearch index rebuild (invoked by cron).
# cron runs with a minimal environment, so we set PATH and an absolute repo
# root explicitly, then delegate to the canonical index script. Output is
# timestamped and appended to a log OUTSIDE the repo so it never dirties git.
set -euo pipefail

REPO_ROOT="/Users/chussey/Documents/a-roofers-open-brain"
export PATH="$HOME/.local/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"

LOG_DIR="$HOME/.memsearch/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/index-cron.log"

cd "$REPO_ROOT"

{
  echo "=== $(date '+%Y-%m-%d %H:%M:%S %z') :: memsearch nightly index start ==="
  if bash scripts/memsearch-index-open-brain.sh; then
    echo "=== $(date '+%Y-%m-%d %H:%M:%S %z') :: done OK ==="
  else
    echo "=== $(date '+%Y-%m-%d %H:%M:%S %z') :: FAILED (exit $?) ==="
  fi
  echo
} >>"$LOG_FILE" 2>&1
