#!/usr/bin/env bash
# Ship the Maya Slack listener release to her Orgo desktop (pe-maya-chen).
#
# Transport: Orgo REST API bash execution (POST /api/computers/{id}/bash) —
# there is no SSH path to the Orgo box. Payload is built from git HEAD (tracked
# top-level listener files only), moved as base64 chunks, SHA-256 verified,
# staged root-owned at the installer's pinned staging path, then installed by
# the release's own install-disabled.sh (hash-pinned, auto-rollback, verified
# stopped) and started under supervisord.
#
# Usage:
#   export ORGO_API_KEY="$(op read 'op://CW_Master/ORGO_API_KEY_MASTER/password')"
#   bash scripts/orgo-ship-maya-listener.sh
#
# Optional env:
#   ORGO_COMPUTER_ID  target computer (default: pe-maya-chen f914c60c-…)
#   SHIP_STEP         run a single step: probe|upload|stage|install|start|verify
set -euo pipefail

API="https://www.orgo.ai/api"
CID="${ORGO_COMPUTER_ID:-f914c60c-c7c0-4a5e-b9dd-dd8b9df825f6}"
: "${ORGO_API_KEY:?export ORGO_API_KEY first (op read op://CW_Master/ORGO_API_KEY_MASTER/password)}"

REPO_ROOT="$(git rev-parse --show-toplevel)"
SRC_PATH="deployment/remote/orgo/maya-slack-listener"
STAGING="/root/pec78-maya-slack-listener-staging"
REMOTE_TMP="/tmp/maya-listener-ship"
RELEASE_DIR="/opt/pe-cc-agents/maya-slack-listener"
CHUNK_BYTES=32768

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# --- remote exec helper -------------------------------------------------------
rexec() {
  local cmd="$1"
  local body resp
  body="$(python3 -c 'import json,sys; print(json.dumps({"command": sys.argv[1]}))' "$cmd")"
  resp="$(curl -sS --max-time 590 -X POST "$API/computers/$CID/bash" \
    -H "Authorization: Bearer $ORGO_API_KEY" -H "Content-Type: application/json" \
    -d "$body")"
  python3 - "$resp" <<'PY'
import json, sys
raw = sys.argv[1]
try:
    d = json.loads(raw)
except Exception:
    print(raw)
    sys.exit(0)
if isinstance(d, dict):
    if d.get("error"):
        print(f"REMOTE API ERROR: {d['error']}", file=sys.stderr)
        sys.exit(1)
    out = d.get("output") or d.get("stdout") or d.get("result") or ""
    err = d.get("stderr") or ""
    code = d.get("exit_code", d.get("exitCode", 0))
    if out: print(str(out).rstrip())
    if err: print(str(err).rstrip(), file=sys.stderr)
    try:
        sys.exit(int(code) if code is not None else 0)
    except (TypeError, ValueError):
        sys.exit(0)
print(raw)
PY
}

# Remote root wrapper: exec user may be root already, or need passwordless sudo.
SUDO=""
detect_sudo() {
  local uid
  uid="$(rexec 'id -u')" || { echo "probe failed — is the desktop running?" >&2; exit 1; }
  if [[ "$uid" != "0" ]]; then
    if rexec 'sudo -n true >/dev/null 2>&1 && echo ok' | grep -q ok; then
      SUDO="sudo -n "
    else
      echo "remote user uid=$uid has no passwordless sudo; cannot stage as root" >&2
      exit 1
    fi
  fi
}

# --- steps --------------------------------------------------------------------
step_probe() {
  echo "== probe: identity and supervisor state"
  rexec 'id && hostname'
  rexec 'supervisorctl status maya-slack-listener 2>&1 || true'
}

build_payload() {
  echo "== build: payload from git HEAD ($SRC_PATH, tests excluded)"
  ( cd "$REPO_ROOT" && git archive HEAD:"$SRC_PATH" ) | tar -x -C "$work"
  rm -rf "$work/test"
  tar -czf "$work/payload.tgz" -C "$work" $(cd "$work" && ls -A | grep -v '^payload.tgz$')
  LOCAL_SHA="$(shasum -a 256 "$work/payload.tgz" | cut -d' ' -f1)"
  echo "   payload: $(du -h "$work/payload.tgz" | cut -f1 | tr -d ' ') sha256=$LOCAL_SHA"
}

step_upload() {
  build_payload
  echo "== upload: chunked base64 → $REMOTE_TMP"
  rexec "rm -rf $REMOTE_TMP && mkdir -p $REMOTE_TMP"
  base64 -i "$work/payload.tgz" | tr -d '\n' > "$work/payload.b64"
  split -b "$CHUNK_BYTES" "$work/payload.b64" "$work/chunk."
  local n=0
  for chunk in "$work"/chunk.*; do
    n=$((n+1))
    rexec "printf '%s' '$(cat "$chunk")' >> $REMOTE_TMP/payload.b64" >/dev/null
    echo "   chunk $n sent"
  done
  echo "== verify: remote sha256"
  rexec "base64 -d $REMOTE_TMP/payload.b64 > $REMOTE_TMP/payload.tgz && sha256sum $REMOTE_TMP/payload.tgz" | tee "$work/remote.sha"
  grep -q "$LOCAL_SHA" "$work/remote.sha" || { echo "SHA-256 MISMATCH — aborting" >&2; exit 1; }
  echo "   sha256 verified"
}

step_stage() {
  echo "== stage: root-owned $STAGING (installer trust checks: 0:0:700, no symlinks, no g/o write)"
  rexec "${SUDO}bash -c 'rm -rf $STAGING && mkdir -m 700 $STAGING && tar -xzf $REMOTE_TMP/payload.tgz -C $STAGING && chown -R root:root $STAGING && chmod -R go-w $STAGING && chmod 700 $STAGING && ls $STAGING | wc -l'"
}

step_install() {
  echo "== install: stop service, run install-disabled.sh (auto-rollback on failure)"
  rexec "${SUDO}supervisorctl stop maya-slack-listener 2>&1 || true"
  rexec "${SUDO}bash $STAGING/install-disabled.sh"
}

step_start() {
  echo "== start: supervisorctl start + status"
  rexec "${SUDO}supervisorctl start maya-slack-listener"
  sleep 8
  rexec "${SUDO}supervisorctl status maya-slack-listener"
  rexec "${SUDO}tail -n 20 /var/log/pe-cc-agents/maya-slack-listener.log 2>/dev/null || true"
}

step_verify() {
  echo "== verify: release content + pinned tree hash"
  rexec "grep -A6 'ACKNOWLEDGEMENT_DOMAINS = ' $RELEASE_DIR/policy.mjs | head -8"
  rexec "node $RELEASE_DIR/tree-integrity.mjs $RELEASE_DIR"
  rexec "rm -rf $REMOTE_TMP"
  echo "== done. Record the tree hash above as the pinned release hash."
}

main() {
  detect_sudo
  case "${SHIP_STEP:-all}" in
    probe)   step_probe ;;
    upload)  step_upload ;;
    stage)   step_stage ;;
    install) step_install ;;
    start)   step_start ;;
    verify)  step_verify ;;
    all)     step_probe; step_upload; step_stage; step_install; step_start; step_verify ;;
    *) echo "unknown SHIP_STEP=${SHIP_STEP}" >&2; exit 1 ;;
  esac
}
main
