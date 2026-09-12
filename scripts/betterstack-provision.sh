#!/usr/bin/env bash
# Provision Better Stack Uptime monitors + heartbeats for the Command Center runtime
# board (docs/109 D3, D10, D11). Idempotent: existing monitors (by URL) and heartbeats
# (by name) are reused, never duplicated. Heartbeat ids + ping URLs are upserted into
# public.runtime_heartbeats (mig 286) so runtime_heartbeat_pump() can ping them.
#
# Secrets: the Better Stack token comes from 1Password via `op read` (never printed);
# the Supabase service-role key from the repo-root .env / config/.env (never printed).
#
#   bash scripts/betterstack-provision.sh            # create/reuse everything
#   bash scripts/betterstack-provision.sh --dry-run  # print the plan only
set -euo pipefail
DRY=0; [ "${1:-}" = "--dry-run" ] && DRY=1
BS=https://uptime.betterstack.com/api/v2
SITE=https://cc.proexteriorsus.net
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_ROOT="${OPEN_BRAIN_ENV_ROOT:-$REPO_ROOT}"

readval(){ grep -E "^#? *$1=" "$2" 2>/dev/null | head -1 | sed -E "s/^#? *[^=]+=//" | tr -d "\"'" | xargs; }
SUPABASE_URL="${SUPABASE_URL:-$(readval SUPABASE_URL "$ENV_ROOT/.env")}"
[ -n "$SUPABASE_URL" ] || SUPABASE_URL="$(readval SUPABASE_URL "$ENV_ROOT/config/.env")"
SRK="${SUPABASE_SERVICE_ROLE_KEY:-$(readval SUPABASE_SERVICE_ROLE_KEY "$ENV_ROOT/.env")}"
[ -n "$SRK" ] || SRK="$(readval SUPABASE_SERVICE_ROLE_KEY "$ENV_ROOT/config/.env")"
TOK="${BETTERSTACK_API_TOKEN:-}"
if [ -z "$TOK" ] && [ "$DRY" = 0 ]; then TOK="$(op read 'op://cw_master/BetterStack_PE_CC_DEV_API/credential')"; fi
if [ "$DRY" = 0 ]; then
  [ -n "$TOK" ] || { echo "no Better Stack token" >&2; exit 1; }
  [ -n "$SUPABASE_URL" ] && [ -n "$SRK" ] || { echo "no SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in $ENV_ROOT" >&2; exit 1; }
fi
echo "env: supabase_url=$([ -n "$SUPABASE_URL" ] && echo set || echo MISSING) service_key=$([ -n "$SRK" ] && echo set || echo MISSING) bs_token=$([ -n "$TOK" ] && echo set || echo MISSING)"

bs(){ curl -sS --max-time 30 -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" "$@"; }

# ── Monitors ─────────────────────────────────────────────────────────────────
# kind|path|name|freq|arg   kind: keyword (arg=required keyword) | status (arg=expected code)
MONITORS=$(cat <<'EOF'
keyword|/healthz|PE-CC · site · /healthz|180|"status":"ok"
status|/agents|PE-CC · page · /agents (WorkOS gate)|300|302
status|/auth.md|PE-CC · agent auth discovery · /auth.md|300|200
status|/api/accounting/kpi-pills|PE-CC · api · accounting/kpi-pills|300|401
status|/api/invoice-audit/pending-verification|PE-CC · api · invoice-audit/pending-verification|300|401
status|/api/executive/cash-runway.json|PE-CC · api · executive/cash-runway|300|401
status|/api/agent/work-queue|PE-CC · api · agent/work-queue|300|401
status|/api/credit-memos/pending|PE-CC · api · credit-memos/pending|300|401
status|/api/accounting/friday-wip.json|PE-CC · api · accounting/friday-wip|300|401
EOF
)
existing_monitors=""
[ "$DRY" = 0 ] && existing_monitors="$(bs "$BS/monitors?per_page=250")"
echo "== monitors"
while IFS='|' read -r kind path name freq arg; do
  [ -n "$kind" ] || continue
  url="$SITE$path"
  if [ "$DRY" = 1 ]; then echo "  plan: $name -> $url ($kind $arg, ${freq}s)"; continue; fi
  found=$(printf '%s' "$existing_monitors" | python3 -c "import sys,json; u=sys.argv[1]; d=json.load(sys.stdin); print(next((r['id'] for r in d.get('data',[]) if r['attributes'].get('url')==u), ''))" "$url")
  if [ -n "$found" ]; then echo "  reuse  $name (id $found)"; continue; fi
  if [ "$kind" = keyword ]; then
    body=$(python3 -c "import json,sys; print(json.dumps({'monitor_type':'keyword','url':sys.argv[1],'required_keyword':sys.argv[2],'pronounceable_name':sys.argv[3],'check_frequency':int(sys.argv[4]),'regions':['us'],'email':False,'sms':False,'call':False,'push':False,'request_timeout':30}))" "$url" "$arg" "$name" "$freq")
  else
    body=$(python3 -c "import json,sys; print(json.dumps({'monitor_type':'expected_status_code','url':sys.argv[1],'expected_status_codes':[int(sys.argv[2])],'follow_redirects':False,'pronounceable_name':sys.argv[3],'check_frequency':int(sys.argv[4]),'regions':['us'],'email':False,'sms':False,'call':False,'push':False,'request_timeout':30}))" "$url" "$arg" "$name" "$freq")
  fi
  resp=$(bs -X POST -d "$body" "$BS/monitors")
  printf '%s' "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin); r=d.get('data'); print('  create', r['attributes']['pronounceable_name'], '(id', r['id']+')', r['attributes'].get('status')) if r else print('  FAILED', sys.argv[1], str(d)[:200])" "$name"
done <<< "$MONITORS"

# ── Heartbeats ───────────────────────────────────────────────────────────────
# component_key|kind|ref|name|period_s|grace_s
HEARTBEATS=$(cat <<'EOF'
pgcron.acculynx-geoid-match-daily|pg_cron|2|PE-CC · pg_cron 2 · acculynx-geoid-match-daily|86400|7200
pgcron.pvp_refresh_nightly|pg_cron|3|PE-CC · pg_cron 3 · pvp_refresh_nightly|86400|7200
pgcron.top20_refresh_quarterly|pg_cron|4|PE-CC · pg_cron 4 · top20_refresh_quarterly|7862400|86400
pgcron.acculynx-hourly-sync|pg_cron|5|PE-CC · pg_cron 5 · acculynx-hourly-sync|3600|900
pgcron.acculynx-reconcile|pg_cron|6|PE-CC · pg_cron 6 · acculynx-reconcile|600|600
pgcron.acculynx-alert-check|pg_cron|7|PE-CC · pg_cron 7 · acculynx-alert-check|900|600
pgcron.wip-ar-master-nightly|pg_cron|11|PE-CC · pg_cron 11 · wip-ar-master-nightly|86400|7200
pgcron.wip-ar-week-roll-thursday|pg_cron|12|PE-CC · pg_cron 12 · wip-ar-week-roll-thursday|604800|21600
pgcron.refresh-office-pricing-matviews|pg_cron|13|PE-CC · pg_cron 13 · refresh-office-pricing-matviews|900|600
pgcron.nightly-silo-assertions|pg_cron|14|PE-CC · pg_cron 14 · nightly-silo-assertions|86400|7200
pgcron.service-matview-refresh-requests|pg_cron|15|PE-CC · pg_cron 15 · service-matview-refresh-requests|300|600
pgcron.refresh-overhead-matview|pg_cron|16|PE-CC · pg_cron 16 · refresh-overhead-matview|86400|7200
pgcron.refresh-order-acculynx-match|pg_cron|18|PE-CC · pg_cron 18 · refresh-order-acculynx-match|900|600
systemd.openbrain-abc-sync|systemd|openbrain-abc-sync.service|PE-CC · systemd · openbrain-abc-sync (03:30 ET)|86400|7200
systemd.openbrain-jt-sentinel|systemd|openbrain-jt-sentinel.service|PE-CC · systemd · openbrain-jt-sentinel (10:00 PT)|86400|7200
systemd.openbrain-maya-gate|systemd|openbrain-maya-gate.service|PE-CC · systemd · openbrain-maya-gate (15 min)|900|600
systemd.openbrain-maya-qa|systemd|openbrain-maya-qa.service|PE-CC · systemd · openbrain-maya-qa (04:30 CT)|86400|7200
systemd.openbrain-qbo-thursday-sync|systemd|openbrain-qbo-thursday-sync.service|PE-CC · systemd · openbrain-qbo-thursday-sync (20:00 CT)|86400|7200
systemd.openbrain-site-sweep|systemd|openbrain-site-sweep.service|PE-CC · systemd · openbrain-site-sweep (06:00 CT)|86400|7200
systemd.openbrain-wip-pack-thursday|systemd|openbrain-wip-pack-thursday.service|PE-CC · systemd · openbrain-wip-pack-thursday (06:00 CT)|86400|7200
EOF
)
existing_hb=""
[ "$DRY" = 0 ] && existing_hb="$(bs "$BS/heartbeats?per_page=250")"
echo "== heartbeats"
while IFS='|' read -r key kind ref name period grace; do
  [ -n "$key" ] || continue
  if [ "$DRY" = 1 ]; then echo "  plan: $key -> $name (${period}s + ${grace}s)"; continue; fi
  rec=$(printf '%s' "$existing_hb" | python3 -c "import sys,json; n=sys.argv[1]; d=json.load(sys.stdin); r=next((r for r in d.get('data',[]) if r['attributes'].get('name')==n), None); print(json.dumps({'id':r['id'],'url':r['attributes']['url'],'status':r['attributes'].get('status')}) if r else '')" "$name")
  if [ -z "$rec" ]; then
    body=$(python3 -c "import json,sys; print(json.dumps({'name':sys.argv[1],'period':int(sys.argv[2]),'grace':int(sys.argv[3]),'email':False,'sms':False,'call':False,'push':False}))" "$name" "$period" "$grace")
    rec=$(bs -X POST -d "$body" "$BS/heartbeats" | python3 -c "import sys,json; d=json.load(sys.stdin); r=d.get('data'); print(json.dumps({'id':r['id'],'url':r['attributes']['url'],'status':r['attributes'].get('status')}) if r else '')")
    [ -n "$rec" ] || { echo "  FAILED $key"; continue; }
    verb=create
  else verb=reuse; fi
  hb_id=$(printf '%s' "$rec" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
  hb_status=$(printf '%s' "$rec" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
  # upsert into runtime_heartbeats (ping_url never printed)
  row=$(printf '%s' "$rec" | python3 -c "import sys,json; r=json.load(sys.stdin); a=sys.argv; print(json.dumps({'component_key':a[1],'kind':a[2],'ref':a[3],'name':a[4],'period_s':int(a[5]),'grace_s':int(a[6]),'betterstack_id':str(r['id']),'ping_url':r['url'],'updated_at':'now()'}))" "$key" "$kind" "$ref" "$name" "$period" "$grace")
  row=${row/\"now()\"/\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}
  code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 -X POST \
    -H "apikey: $SRK" -H "Authorization: Bearer $SRK" -H "Content-Type: application/json" \
    -H "Prefer: resolution=merge-duplicates" -d "$row" "$SUPABASE_URL/rest/v1/runtime_heartbeats")
  echo "  $verb  $key (id $hb_id, $hb_status) -> runtime_heartbeats http $code"
done <<< "$HEARTBEATS"
echo "done"
