#!/usr/bin/env bash
# Thursday AR/WIP pack build + publish (docs/85).
#
#   bash scripts/wip-pack-thursday.sh                 # as-of today
#   bash scripts/wip-pack-thursday.sh 2026-08-06      # explicit as-of date
#
# Sequence (Thursday morning, after Wed-night ABC sync + Thu AccuLynx hourly):
#   1. refresh_wip_ar_master() — pull tonight's mirror state into the board
#      (the pg_cron nightly already ran; this is belt-and-braces so the pack
#      and the board agree to the minute).
#   2. scripts/analytics/build_pack.py --audience ar-wip — the full Excel pack
#      (13 sheets incl. 11_Friday_Meeting), same generator as always.
#   3. Upload the xlsx to the private Supabase storage bucket `wip-packs` as
#      AR_WIP_Pack_<date>.xlsx. The Command Center "Download Thursday pack"
#      button serves the newest file from that bucket via a signed URL.
#
# systemd: deployment/remote/systemd/openbrain-wip-pack-thursday.{service,timer}
# (Thu 06:00 America/Chicago). Credentials come from repo-root .env
# (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY), same as build_pack.py.
set -euo pipefail

AS_OF="${1:-$(date +%F)}"
REPO_ROOT="${WIP_PACK_REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
export PATH="/opt/homebrew/bin:/opt/node22/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$HOME/.local/bin"
# aspose-cells (bundled .NET) on Linux hosts: ICU discovery fails on Ubuntu 24
# even with libicu74 installed — invariant globalization is the supported
# workaround and is safe for this workbook (all en-US content).
export DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1

LOG_DIR="$HOME/.wip-pack/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/wip-pack.log"
log() { echo "[$(date '+%F %T')] $*" | tee -a "$LOG_FILE"; }

cd "$REPO_ROOT"

# Env: same loading order as build_pack.py (master.env then repo .env).
set -a
[ -f "$HOME/.config/cleverwork/master.env" ] && . "$HOME/.config/cleverwork/master.env"
[ -f "$REPO_ROOT/.env" ] && . "$REPO_ROOT/.env"
[ -f "$REPO_ROOT/config/.env" ] && . "$REPO_ROOT/config/.env"
set +a

: "${SUPABASE_URL:?SUPABASE_URL missing}"
SERVICE_KEY="${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY missing}"

log "1/3 refresh_wip_ar_master() as-of $AS_OF"
curl -sS -X POST "$SUPABASE_URL/rest/v1/rpc/refresh_wip_ar_master" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"p_asof\": \"$AS_OF\"}" | tee -a "$LOG_FILE"
echo | tee -a "$LOG_FILE"

log "2/3 build_pack.py --audience ar-wip --as-of $AS_OF"
python3 "$REPO_ROOT/scripts/analytics/build_pack.py" --audience ar-wip --as-of "$AS_OF" >> "$LOG_FILE" 2>&1

XLSX="$REPO_ROOT/outputs/analytics/ar-wip/$AS_OF/ar-wip-$AS_OF.xlsx"
if [ ! -f "$XLSX" ]; then
  # generator naming fallback: newest xlsx under the as-of dir
  XLSX="$(ls -t "$REPO_ROOT/outputs/analytics/ar-wip/$AS_OF/"*.xlsx 2>/dev/null | head -1 || true)"
fi
[ -f "$XLSX" ] || { log "ERROR: pack xlsx not found for $AS_OF"; exit 1; }

DEST_NAME="AR_WIP_Pack_$AS_OF.xlsx"
log "3/3 upload $XLSX -> storage/wip-packs/$DEST_NAME"
HTTP_CODE=$(curl -sS -o /tmp/wip-pack-upload.json -w "%{http_code}" -X POST \
  "$SUPABASE_URL/storage/v1/object/wip-packs/$DEST_NAME" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" \
  -H "x-upsert: true" \
  --data-binary "@$XLSX")
cat /tmp/wip-pack-upload.json | tee -a "$LOG_FILE"; echo | tee -a "$LOG_FILE"
case "$HTTP_CODE" in
  200|201) log "OK — pack published ($DEST_NAME)";;
  *) log "ERROR: upload returned HTTP $HTTP_CODE"; exit 1;;
esac
