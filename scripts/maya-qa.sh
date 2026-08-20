#!/usr/bin/env bash
# Maya nightly QA runner (scripts/maya-qa-orchestrate.mjs).
# systemd: deployment/remote/systemd/openbrain-maya-qa.{service,timer}.
set -euo pipefail
REPO_ROOT="${MAYA_QA_REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
export PATH="/opt/homebrew/bin:/opt/node22/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
LOG_DIR="$HOME/.maya-qa/logs"; mkdir -p "$LOG_DIR"
cd "$REPO_ROOT"
set -a
[ -f "$REPO_ROOT/.env" ] && . "$REPO_ROOT/.env"
[ -f "$HOME/.config/cleverwork/ob_readonly.env" ] && . "$HOME/.config/cleverwork/ob_readonly.env"
set +a
export CHAOS_REPO_ROOT="$REPO_ROOT"
node "$REPO_ROOT/scripts/maya-qa-orchestrate.mjs" "$@" 2>&1 | tee -a "$LOG_DIR/maya-qa.log"
