#!/usr/bin/env bash
# Daily site quality sweep runner (docs/92; scripts/site-quality-sweep.mjs).
# systemd: deployment/remote/systemd/openbrain-site-sweep.{service,timer}.
#
# Exists because the unit's original `EnvironmentFile=-/opt/openbrain/master.env`
# pointed at a file that does not exist on the host — so the sweep would have run
# with no credentials at all (and, being a `-` optional path, silently). The env
# actually lives in the repo clone's own .env, which systemd cannot parse directly
# (quoted and multi-line values), so it is sourced by bash here — the same pattern
# maya-gate.sh already uses on this host.
set -euo pipefail

REPO_ROOT="${SWEEP_REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
export PATH="/opt/homebrew/bin:/opt/node22/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

LOG_DIR="$HOME/.site-sweep/logs"
mkdir -p "$LOG_DIR"

cd "$REPO_ROOT"
set -a
[ -f "$REPO_ROOT/.env" ] && . "$REPO_ROOT/.env"
[ -f "$HOME/.config/cleverwork/ob_readonly.env" ] && . "$HOME/.config/cleverwork/ob_readonly.env"
set +a

# SWEEP_REPO_ROOT is what the sweep's own static analysis walks.
export SWEEP_REPO_ROOT="$REPO_ROOT"
node "$REPO_ROOT/scripts/site-quality-sweep.mjs" "$@" 2>&1 | tee -a "$LOG_DIR/site-sweep.log"
