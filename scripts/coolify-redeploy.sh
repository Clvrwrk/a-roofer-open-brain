#!/usr/bin/env bash
# Coolify redeploy for the Command Center (cc.proexteriorsus.net) — TIGHTLY SCOPED.
# It can do exactly two things and nothing else:
#   (no args)         → trigger a redeploy of the command-center app, print deployment_uuid
#   status <uuid>     → print that deployment's status + the live /healthz buildCommit
# Hardcodes the command-center UUID and only touches the Coolify deploy/deployments
# endpoints. Reads the API key in-place from root .env (commented COOLIFY_* line) and
# NEVER echoes it. This is the allow-listed entry point for agent-triggered prod deploys
# (see .claude/settings.json → permissions.allow). Full host reference: docs/27 + coolify skill.
set -euo pipefail
cd "$(dirname "$0")/.."

BASE="https://coolify.proexteriorsus.net/api/v1"
UUID="og0rmt02rff8qti9nlfk3nr7"
HEALTHZ="https://cc.proexteriorsus.net/healthz"

key() {
  grep -E '^#? *COOLIFY_PE_OPEN_BRAIN_API_KEY=' .env 2>/dev/null | head -1 \
    | sed -E 's/^#? *[^=]+=//' | tr -d "\"'" | xargs
}
KEY="$(key)"
[ -n "$KEY" ] || { echo "ERROR: COOLIFY_PE_OPEN_BRAIN_API_KEY not found in .env" >&2; exit 1; }

healthz() {
  curl -s --max-time 15 "$HEALTHZ" \
    | python3 -c "import sys,json;d=json.load(sys.stdin);print('healthz status=%s buildCommit=%s'%(d.get('status'),(d.get('buildCommit') or '?')[:7]))" 2>/dev/null \
    || echo "healthz: (unreachable)"
}

case "${1:-trigger}" in
  status)
    DUUID="${2:?usage: coolify-redeploy.sh status <deployment_uuid>}"
    curl -s --max-time 20 -H "Authorization: Bearer $KEY" "$BASE/deployments/$DUUID" \
      | python3 -c "import sys,json;d=json.load(sys.stdin);print('deployment status=%s'%d.get('status'))" 2>/dev/null \
      || echo "status: (could not read)"
    healthz
    ;;
  trigger)
    echo "Triggering Coolify redeploy of command-center ($UUID)…"
    RESP="$(curl -s --max-time 25 -H "Authorization: Bearer $KEY" "$BASE/deploy?uuid=$UUID")"
    DUUID="$(printf '%s' "$RESP" | python3 -c "import sys,json;d=json.load(sys.stdin);print((d.get('deployments') or [{}])[0].get('deployment_uuid',''))" 2>/dev/null || true)"
    if [ -z "$DUUID" ]; then echo "ERROR: no deployment_uuid in response: $RESP" >&2; exit 1; fi
    echo "deployment_uuid=$DUUID"
    echo "poll with: bash scripts/coolify-redeploy.sh status $DUUID"
    ;;
  *)
    echo "usage: coolify-redeploy.sh [status <deployment_uuid>]" >&2; exit 2;;
esac
