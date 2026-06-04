#!/usr/bin/env bash
# new-client.sh — provision an isolated roofer brain from this template.
# Reads config/roofer.config.yaml + .env. Idempotent where possible.
# Prerequisites: yq (https://github.com/mikefarah/yq), supabase CLI, psql, deno.
# Pass --dry-run to print the plan without making changes (auto-enabled if
# the supabase CLI is missing).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="$ROOT/config/roofer.config.yaml"
ENVFILE="$ROOT/.env"
DRY_RUN=0
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1

say()  { printf "\033[1;36m▸ %s\033[0m\n" "$*"; }
warn() { printf "\033[1;33m! %s\033[0m\n" "$*"; }
die()  { printf "\033[1;31m✗ %s\033[0m\n" "$*" >&2; exit 1; }
run()  { if [[ $DRY_RUN -eq 1 ]]; then printf "   would run: %s\n" "$*"; else eval "$@"; fi; }
is_set() { [[ -n "${1:-}" && "$1" != "__set_me__" && "$1" != *"YOUR-PROJECT"* && "$1" != *"CLIENT"* && "$1" != "null" ]]; }
trigger_hook() {
  local app="$1"
  local var="$2"
  local hook="${!var:-}"
  if ! is_set "$hook"; then
    warn "$var not set — create the $app Coolify app and add its deploy webhook before live setup"
    return 0
  fi
  if [[ $DRY_RUN -eq 1 ]]; then
    printf "   would trigger Coolify deploy hook: %s (%s)\n" "$app" "$var"
    return 0
  fi
  local auth=()
  if is_set "${COOLIFY_API_TOKEN:-}"; then
    auth=(-H "Authorization: Bearer ${COOLIFY_API_TOKEN}")
  fi
  curl -fsS -X GET "${auth[@]}" "$hook" >/dev/null
  echo "   ✓ triggered $app"
}

# --- preflight ---
[[ -f "$CONFIG" ]] || die "missing $CONFIG — copy config/roofer.config.example.yaml first"
[[ -f "$ENVFILE" ]] || die "missing .env — copy config/.env.example first"
command -v yq >/dev/null || die "yq not found — install mikefarah/yq, then re-run"
command -v supabase >/dev/null || { warn "supabase CLI not found — forcing --dry-run"; DRY_RUN=1; }
command -v psql >/dev/null || { warn "psql not found — forcing --dry-run"; DRY_RUN=1; }
command -v deno >/dev/null || { warn "deno not found — forcing --dry-run"; DRY_RUN=1; }
command -v curl >/dev/null || { warn "curl not found — forcing --dry-run"; DRY_RUN=1; }

set -a
# shellcheck disable=SC1090
source "$ENVFILE"
set +a

cfg() { yq -r "$1" "$CONFIG"; }

COMPANY="$(cfg '.company.name')"
PROFILE="$(cfg '.deployment.profile')"
PROJECT_REF="$(cfg '.deployment.remote.supabase_project_ref')"
say "Provisioning brain for: $COMPANY  (profile: $PROFILE)"
[[ $DRY_RUN -eq 1 ]] && warn "DRY RUN — no changes will be made"

# --- 1. Supabase project ---
if [[ "$PROFILE" == "remote" ]]; then
  if [[ -z "$PROJECT_REF" || "$PROJECT_REF" == "null" ]]; then
    say "1. Create a dedicated Supabase project (one brain per client = total isolation)"
    run "supabase projects create \"$COMPANY brain\" --org-id \"\$SUPABASE_ORG_ID\""
    warn "   copy the new project ref into config/roofer.config.yaml: deployment.remote.supabase_project_ref"
  else
    say "1. Using existing Supabase project: $PROJECT_REF"
    run "supabase link --project-ref \"$PROJECT_REF\""
  fi
else
  say "1. Local profile selected — see docs/04-going-local.md (docker-compose + Ollama)"
  run "docker compose -f \"$ROOT/deployment/local/docker-compose.yml\" up -d"
fi

# --- 2. Schema (apply in order; see schemas/README.md) ---
say "2. Apply schema migrations (idempotent)"
SCHEMA_FILES=(
  "schemas/ob1-base/00-core-thoughts.sql"
  "schemas/ob1-base/enhanced-thoughts.sql"
  "schemas/ob1-base/provenance-chains.sql"
  "schemas/ob1-base/typed-reasoning-edges.sql"
  "schemas/ob1-base/agent-memory.sql"
  "schemas/cleverwork-roofer/10-property-jurisdiction.sql"
  "schemas/cleverwork-roofer/20-client-job-crew.sql"
  "schemas/cleverwork-roofer/30-insurance-warranty.sql"
  "schemas/cleverwork-roofer/40-atom-extensions.sql"
  "schemas/cleverwork-roofer/50-consent-access-log.sql"
  "schemas/cleverwork-roofer/60-tighten-grants.sql"
)
for f in "${SCHEMA_FILES[@]}"; do
  [[ -f "$ROOT/$f" ]] || die "schema file missing: $f"
  run "psql \"\$SUPABASE_DB_URL\" -v ON_ERROR_STOP=1 -f \"$ROOT/$f\""
done

# --- 3. MCP servers on Hetzner via Coolify (Historian/Capture internal + a SEPARATE Researcher) ---
say "3. Trigger Coolify deploy hooks for MCP containers"
trigger_hook "brain-mcp (internal: Historian + Capture; service_role)" COOLIFY_BRAIN_MCP_DEPLOY_HOOK
trigger_hook "researcher (external-only; NO db creds)" COOLIFY_RESEARCHER_DEPLOY_HOOK
if [[ "$(cfg '.integrations.acculynx.enabled')" == "true" && "$(cfg '.integrations.acculynx.webhook')" == "true" ]]; then
  trigger_hook "acculynx-bridge" COOLIFY_ACCULYNX_BRIDGE_DEPLOY_HOOK
fi

# --- 4. Runtime env inventory (set in Coolify/vault; never committed) ---
say "4. Confirm runtime env inventory"
for k in SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY OB_ACCESS_KEY_HISTORIAN BRAIN_MCP_URL; do
  if is_set "${!k:-}"; then echo "   ✓ $k present in local .env"; else warn "$k is missing or placeholder in .env"; fi
done
warn "Before live deploy, set brain-mcp env in Coolify: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OB_ACCESS_KEY_HISTORIAN, embeddings keys, and enabled bridge keys."
warn "Set researcher env separately and do NOT give it SUPABASE_SERVICE_ROLE_KEY."

# --- 5. Seed jurisdictions + regulatory snapshots from config (property-onboarding recipe) ---
say "5. Seed jurisdictions / regulatory snapshots from config"
J_COUNT="$(cfg '.jurisdictions | length')"
say "   ${J_COUNT} jurisdiction(s) to seed (see recipes/property-onboarding/)"
run "deno run --allow-net --allow-env \"$ROOT/scripts/seed_jurisdictions.ts\" \"$CONFIG\""

# --- 6. Slack app (manual OAuth) ---
say "6. Register Slack app"
if [[ "$(cfg '.integrations.slack.enabled')" == "true" ]]; then
  MANIFEST="$(cfg '.integrations.slack.app_manifest // ""')"
  if is_set "$MANIFEST"; then echo "   • manifest: $MANIFEST"; fi
  cfg '.integrations.slack.bot_handles[]' | while read -r h; do echo "   • installed bot: @$h"; done
  cfg '.integrations.slack.logical_agent_handles[]?' | while read -r h; do echo "   • logical agent route: @$h"; done
  warn "   Slack OAuth is a manual one-time step — see docs/01-onboard-a-roofer.md"
fi

# --- 7. Bridges ---
say "7. Configure enabled data bridges"
for b in gohighlevel acculynx companycam quickbooks startinfinity eagleview; do
  if [[ "$(cfg ".integrations.${b}.enabled")" == "true" ]]; then echo "   • ${b} (see integrations/bridges/${b}/)"; fi
done

# --- 8. Dashboard (self-hosted on Hostinger KVM via Coolify; Cleverwork-owned, no Vercel) ---
if [[ "$(cfg '.deployment.dashboard.enabled')" == "true" ]]; then
  say "8. Deploy self-hosted Astro dashboard via Coolify"
  run "(cd \"$ROOT/deployment/remote\" && ./deploy-dashboard.sh)"
fi

say "Done. Next: ./scripts/verify-deployment.sh"
