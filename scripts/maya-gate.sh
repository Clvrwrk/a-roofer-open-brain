#!/usr/bin/env bash
# Maya diagnose → Slack-approved repair gate runner (A3; scripts/maya-gate.mjs).
# systemd: deployment/remote/systemd/openbrain-maya-gate.{service,timer} (*/15 min).
set -euo pipefail

REPO_ROOT="${MAYA_GATE_REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
export PATH="/opt/homebrew/bin:/opt/node22/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

LOG_DIR="$HOME/.maya-gate/logs"
mkdir -p "$LOG_DIR"

cd "$REPO_ROOT"
set -a
[ -f "$REPO_ROOT/.env" ] && . "$REPO_ROOT/.env"
[ -f "$HOME/.config/cleverwork/linear.env" ] && . "$HOME/.config/cleverwork/linear.env"
[ -f "$HOME/.config/cleverwork/ob_readonly.env" ] && . "$HOME/.config/cleverwork/ob_readonly.env"
set +a

node "$REPO_ROOT/scripts/maya-gate.mjs" "${1:-run}" 2>&1 | tee -a "$LOG_DIR/maya-gate.log"
