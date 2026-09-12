#!/usr/bin/env bash
# Retire the host-wide Traefik override that pointed ALL of cc.proexteriorsus.net at a
# CRM-built container (docs/110 §4 step 3). Run as root on the Coolify host 178.105.220.14:
#
#   ssh -i ~/.ssh/a_roofers_open_brain_ed25519 root@178.105.220.14 'bash -s' < deployment/remote/retire-cc-host-override.sh
#
# After this, Traefik's docker-label router for the Coolify app `command-center`
# (origin/main) serves the host; crm-cc-sales-mirror.yml (path-scoped /sales*) stays.
# Traefik hot-reloads the dynamic directory — no restart.
#
# Rollback: mv /data/coolify/proxy/retired/crm-cc-staff.yml.<stamp> /data/coolify/proxy/dynamic/crm-cc-staff.yml
set -euo pipefail
DYN=/data/coolify/proxy/dynamic
RET=/data/coolify/proxy/retired
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p "$RET"
if [ -f "$DYN/crm-cc-staff.yml" ]; then
  mv "$DYN/crm-cc-staff.yml" "$RET/crm-cc-staff.yml.$STAMP"
  echo "retired crm-cc-staff.yml -> $RET/crm-cc-staff.yml.$STAMP"
else
  echo "crm-cc-staff.yml not present (already retired)"
fi
echo "remaining host-wide routers (must be empty):"
grep -l 'Host(`cc.proexteriorsus.net`)' "$DYN"/*.yml "$DYN"/*.yaml 2>/dev/null | while read -r f; do
  if ! grep -q 'PathPrefix\|Path(' "$f"; then echo "  !! $f"; fi
done
echo "dynamic dir now:"; ls -1 "$DYN"
sleep 3
CC=$(docker ps -q -f name=lu5txzhyoza7uuz0scwpobv7 | head -1)
echo "coolify main container SOURCE_COMMIT: $(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$CC" | grep '^SOURCE_COMMIT=' | cut -c15-22)"
echo "public /healthz: $(curl -s --max-time 15 https://cc.proexteriorsus.net/healthz | head -c 200)"
echo "companion asset: $(curl -s -o /dev/null --max-time 15 -w '%{http_code}' https://cc.proexteriorsus.net/sales-mirror-assets/pro-exteriors-logo.svg)"
