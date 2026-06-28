#!/usr/bin/env bash
# provision-agent-env.sh — fill missing credentials in each agent's Hermes .env
# on the agent host, sourcing values from the LOCAL project .env.
#
# Why: agents were deployed with incomplete profiles (empty ABC auth URL/scopes
# and empty SUPABASE_SERVICE_TOKEN), so they cannot authenticate to ABC Supply or
# the brain. See docs/56 §7b. This is the permanent, re-runnable fix.
#
# Safety:
#   - Secrets are read from the local .env into shell vars and piped over ssh;
#     they are NEVER echoed to stdout.
#   - Each remote .env is backed up before editing.
#   - SECURITY BOUNDARY (CLAUDE.md rule 5): the Researcher (rowan.vale) is
#     external-only and is EXCLUDED from brain (Supabase) credentials.
#   - Only fills keys that are EMPTY/missing; never overwrites a populated value.
#
# Usage:  bash scripts/provision-agent-env.sh            # dry-run (prints plan)
#         bash scripts/provision-agent-env.sh --apply    # perform the edits
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_ENV="$REPO_DIR/.env"
SSH_KEY="$HOME/.ssh/a_roofers_open_brain_ed25519"
HOST="root@5.78.146.161"
IMAGE_ID="2c589484-3521-41fc-bec6-ac785ae87dd7"
APPLY="${1:-}"

[ -f "$LOCAL_ENV" ] || { echo "ERROR: local .env not found at $LOCAL_ENV" >&2; exit 1; }

# --- read a key's value from the local .env (no echo) ---
getenv() { grep -E "^$1=" "$LOCAL_ENV" | head -1 | sed -E "s/^$1=//" | sed -E 's/^"//; s/"$//'; }

# Secret + config values sourced from local .env
SUPABASE_SVC="$(getenv SUPABASE_SERVICE_ROLE_KEY)"   # agents read this as SUPABASE_SERVICE_TOKEN
# Non-secret ABC prod values (canonical, from config/.env.example)
ABC_AUTH="https://auth.partners.abcsupply.com/oauth2/ausvvp0xuwGKLenYy357"
ABC_API="https://partners.abcsupply.com"
ABC_SCOPES="location.read product.read account.read pricing.read order.read allOrder.read notification.read invoice.read invoice.history.read"

[ -n "$SUPABASE_SVC" ] || { echo "ERROR: SUPABASE_SERVICE_ROLE_KEY empty in local .env" >&2; exit 1; }

# Agent roster.  Format: "<email-prefix>|<brain_access yes/no>|<abc_access yes/no>"
# Researcher (rowan.vale) = external-only → brain=no, abc=no.
AGENTS=(
  "alex.rivers|yes|yes"
  "maya.chen|yes|yes"
  "casey.morgan|yes|no"
  "jordan.price|yes|yes"
  "sam.torres|yes|no"
  "lena.brooks|yes|no"
  "rowan.vale|no|no"          # external-only — NO brain, NO ABC
)

echo "Mode: ${APPLY:-dry-run}"
echo "Provisioning ${#AGENTS[@]} agent profiles (brain token + ABC config where applicable)…"
echo

for entry in "${AGENTS[@]}"; do
  IFS='|' read -r prefix brain abc <<<"$entry"
  email="${prefix}@cc.proexteriorsus.net"
  echo "── $email  (brain=$brain abc=$abc)"
  if [ "$APPLY" != "--apply" ]; then continue; fi

  # Build the remote provisioning script; values passed via env to avoid echo.
  REMOTE='ENV="/mnt/kasm_profiles/'"$email"'/'"$IMAGE_ID"'/.hermes/.env";
    [ -f "$ENV" ] || { echo "  SKIP: no .env"; exit 0; }
    cp "$ENV" "$ENV.bak-$(date +%Y%m%d%H%M%S)";
    setkey() { # setkey KEY VALUE — only if currently empty/missing
      k="$1"; v="$2";
      if grep -qE "^${k}=.+" "$ENV"; then echo "  keep ${k} (already set)"; return; fi
      if grep -qE "^${k}=" "$ENV"; then
        tmp="$(mktemp)"; grep -vE "^${k}=" "$ENV" > "$tmp"; mv "$tmp" "$ENV";
      fi
      printf "%s=%s\n" "$k" "$v" >> "$ENV"; echo "  set ${k}";
    };
    [ "$BRAIN" = "yes" ] && setkey SUPABASE_SERVICE_TOKEN "$SVC";
    if [ "$ABC" = "yes" ]; then
      setkey ABC_SUPPLY_AUTH_BASE_URL "$AABC_AUTH";
      setkey ABC_SUPPLY_API_BASE_URL "$AABC_API";
      setkey ABC_SUPPLY_SCOPES "$AABC_SCOPES";
    fi
    chown 1000:1000 "$ENV"; chmod 600 "$ENV";'

  ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=15 "$HOST" \
    "BRAIN='$brain' ABC='$abc' SVC='$SUPABASE_SVC' AABC_AUTH='$ABC_AUTH' AABC_API='$ABC_API' AABC_SCOPES='$ABC_SCOPES' bash -c '$REMOTE'"
done

echo
echo "Done. Re-run the read-only capability check to confirm (docs/56 §7b)."
