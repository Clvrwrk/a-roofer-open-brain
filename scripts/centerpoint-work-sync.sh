#!/usr/bin/env bash
# Daily CenterPoint -> Supabase pull of the six collections behind the work tables
# (docs/78; files 343-345). READ-ONLY against CenterPoint: GET requests only.
#
#   bash scripts/centerpoint-work-sync.sh
#
# Runs from openbrain-centerpoint-sync.timer at 19:45 America/Chicago. The pull
# upserts public.cp_resources. The hourly pg_cron job centerpoint-work-refresh
# (file 345) then projects the rows into work_* and refreshes mv_work_job_money,
# so this script does not call the projection itself.
#
# Needs CENTERPOINT_API_TOKEN (master.env) and SUPABASE_URL +
# SUPABASE_SERVICE_ROLE_KEY (repo .env). Prints no secret values.
set -euo pipefail

REPO_ROOT="${CP_SYNC_REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
export PATH="/opt/homebrew/bin:/opt/node22/bin:/usr/local/bin:/usr/bin:/bin:$HOME/.local/bin:$PATH"
ONLY="companies,productions,properties,invoices,transactions,work_time_entries"

cd "$REPO_ROOT"
for f in "$HOME/.config/cleverwork/master.env" "$REPO_ROOT/.env"; do
  if [ -f "$f" ]; then set -a; . "$f"; set +a; fi
done

if [ -z "${CENTERPOINT_API_TOKEN:-}" ]; then
  echo "centerpoint-work-sync: CENTERPOINT_API_TOKEN is not set on this host" >&2
  exit 2
fi

echo "=== $(date '+%Y-%m-%d %H:%M:%S %z') :: centerpoint work sync start (only=$ONLY) ==="
node integrations/bridges/centerpoint/mirror-backfill.mjs --mode=backfill "--only=$ONLY" --page-size=100
echo "=== $(date '+%Y-%m-%d %H:%M:%S %z') :: done OK ==="
