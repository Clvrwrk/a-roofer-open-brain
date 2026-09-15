#!/usr/bin/env bash
# Report a systemd oneshot's result to the runtime board (docs/109 D7/D12, mig 286).
#
# Wired as `ExecStopPost=` on every openbrain-*.service, so it runs after the job
# whether it succeeded or failed. systemd sets $SERVICE_RESULT, $EXIT_CODE and
# $EXIT_STATUS for ExecStopPost; we translate them into one row of
# public.runtime_job_runs via the service-role RPC runtime_job_report().
#
#   scripts/runtime-job-report.sh <component_key>        # e.g. systemd.openbrain-abc-sync
#
# Manual use (outside systemd): pass status via env — RESULT=success|failure EXIT=0.
# Never prints secrets. Exits 0 always: a reporting failure must not fail the unit.
set -u
COMPONENT="${1:-}"
[ -n "$COMPONENT" ] || { echo "runtime-job-report: component key required" >&2; exit 0; }

HOME="${HOME:-/root}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Same env loading order as the wrappers: master.env, then repo .env, then config/.env.
for f in "$HOME/.config/cleverwork/master.env" "$REPO_ROOT/.env" "$REPO_ROOT/config/.env"; do
  if [ -f "$f" ]; then set -a; . "$f" 2>/dev/null || true; set +a; fi
done
: "${SUPABASE_URL:=}"; : "${SUPABASE_SERVICE_ROLE_KEY:=}"
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  echo "runtime-job-report: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing — not reported" >&2
  exit 0
fi

RESULT="${RESULT:-${SERVICE_RESULT:-unknown}}"
EXIT="${EXIT:-${EXIT_STATUS:-}}"
case "$RESULT" in
  success)        STATUS="success" ;;
  timeout)        STATUS="timeout" ;;
  exit-code|signal|core-dump|watchdog|resources|protocol|start-limit-hit) STATUS="failure" ;;
  *)              STATUS="failure" ;;
esac
# SuccessExitStatus=0 1 units report success with exit 1 — the board shows that as yellow.
SUMMARY="service_result=${RESULT} exit_code=${EXIT_CODE:-?} exit_status=${EXIT:-?}"
HOST="$(hostname -s 2>/dev/null || echo unknown)"
EXIT_JSON="null"; case "$EXIT" in ''|*[!0-9]*) ;; *) EXIT_JSON="$EXIT" ;; esac

# started_at: systemd knows when the main process started (ExecMainStartTimestamp); the
# component key is systemd.<unit> so the unit name is derivable. Falls back to null so a
# manual run (or a non-systemd host) still reports. The board reads created_at when null.
STARTED_JSON="null"
case "$COMPONENT" in
  systemd.*)
    UNIT="${COMPONENT#systemd.}"
    TS="$(systemctl show -p ExecMainStartTimestamp --value "${UNIT}.service" 2>/dev/null || true)"
    if [ -n "$TS" ] && [ "$TS" != "n/a" ]; then
      ISO="$(date -u -d "$TS" '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || true)"
      [ -n "$ISO" ] && STARTED_JSON="\"$ISO\""
    fi
    ;;
esac

payload=$(printf '{"p_component_key":"%s","p_status":"%s","p_exit_code":%s,"p_summary":"%s","p_host":"%s","p_started_at":%s}' \
  "$COMPONENT" "$STATUS" "$EXIT_JSON" "$SUMMARY" "$HOST" "$STARTED_JSON")
code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 -X POST \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" -d "$payload" \
  "$SUPABASE_URL/rest/v1/rpc/runtime_job_report" 2>/dev/null || echo 000)
echo "runtime-job-report: $COMPONENT -> $STATUS (http $code)"
exit 0
