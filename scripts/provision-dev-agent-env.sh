#!/usr/bin/env bash
# provision-dev-agent-env.sh — provision DevTeam Hermes profiles (NO brain token).
# Extends provision-agent-env.sh plane boundary for doc 58.
#
# Usage: bash scripts/provision-dev-agent-env.sh            # dry-run
#        bash scripts/provision-dev-agent-env.sh --apply
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_ENV="$REPO_DIR/.env"
SSH_KEY="$HOME/.ssh/a_roofers_open_brain_ed25519"
HOST="root@5.78.146.161"
IMAGE_ID="2c589484-3521-41fc-bec6-ac785ae87dd7"
APPLY="${1:-}"

getenv() { grep -E "^$1=" "$LOCAL_ENV" 2>/dev/null | head -1 | sed -E "s/^$1=//" | sed -E 's/^"//; s/"$//'; }

# Dev plane agents — virtual emails on cc.proexteriorsus.net
DEV_AGENTS=(
  "dev-conductor"
  "pe-cc-agents"
  "pe-cc-hermes-dev"
)

echo "Mode: ${APPLY:-dry-run}"
echo "DevTeam plane — NO SUPABASE_SERVICE_TOKEN will be written."
echo

LINEAR_KEY="$(getenv LINEAR_API_KEY || true)"
GITHUB_TOKEN="$(getenv GITHUB_TOKEN || true)"
SENTRY_TOKEN="$(getenv SENTRY_AUTH_TOKEN || true)"
PAGESPEED_KEY="$(getenv PAGESPEED_API_KEY || true)"
DATAFORSEO_LOGIN="$(getenv DATAFORSEO_LOGIN || true)"
DATAFORSEO_PASSWORD="$(getenv DATAFORSEO_PASSWORD || true)"
GSC_SITE_URL="$(getenv GSC_SITE_URL || true)"
GSC_SA="$(getenv GSC_SERVICE_ACCOUNT_JSON || getenv GOOGLE_APPLICATION_CREDENTIALS || true)"

for prefix in "${DEV_AGENTS[@]}"; do
  email="${prefix}@cc.proexteriorsus.net"
  echo "── $email (dev plane)"
  if [ "$APPLY" != "--apply" ]; then continue; fi

  ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$HOST" \
    "ENV=\"/mnt/kasm_profiles/${email}/${IMAGE_ID}/.hermes/.env\";
     [ -f \"\$ENV\" ] || { echo '  SKIP: no .env'; exit 0; };
     if grep -qE '^SUPABASE_SERVICE_TOKEN=.+' \"\$ENV\"; then
       echo '  FAIL: brain token present on dev profile'; exit 1;
     fi;
     cp \"\$ENV\" \"\$ENV.bak-\$(date +%Y%m%d%H%M%S)\";
     setkey() {
       k=\"\$1\"; v=\"\$2\";
       [ -z \"\$v\" ] && return;
       if grep -qE \"^\${k}=.+\" \"\$ENV\"; then echo \"  keep \${k}\"; return; fi
       if grep -qE \"^\${k}=\" \"\$ENV\"; then
         tmp=\"\$(mktemp)\"; grep -vE \"^\${k}=\" \"\$ENV\" > \"\$tmp\"; mv \"\$tmp\" \"\$ENV\";
       fi;
       printf '%s=%s\n' \"\$k\" \"\$v\" >> \"\$ENV\"; echo \"  set \${k}\";
     };
     setkey PLANE devteam;
     setkey NO_SUPABASE_SERVICE_ROLE true;
     setkey LINEAR_API_KEY '${LINEAR_KEY}';
     setkey GITHUB_TOKEN '${GITHUB_TOKEN}';
     setkey SENTRY_AUTH_TOKEN '${SENTRY_TOKEN}';
     setkey PAGESPEED_API_KEY '${PAGESPEED_KEY}';
     setkey DATAFORSEO_LOGIN '${DATAFORSEO_LOGIN}';
     setkey DATAFORSEO_PASSWORD '${DATAFORSEO_PASSWORD}';
     setkey GSC_SITE_URL '${GSC_SITE_URL}';
     setkey GSC_SERVICE_ACCOUNT_JSON '${GSC_SA}';
     setkey LINEAR_TEAM_ID f7fd2005-aa04-4de7-a17d-ddae528b5e4a;
     echo '  plane boundary OK (no brain token)'"
done

echo
echo "Done. Run: node scripts/open-engine-preflight.mjs"
