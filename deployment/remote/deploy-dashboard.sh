#!/usr/bin/env bash
# deploy-dashboard.sh — deploy the self-hosted dashboard to Coolify (Hostinger KVM).
# Cleverwork owns the dashboard internally; we do NOT use Vercel.
# Triggered by scripts/new-client.sh when deployment.dashboard.enabled = true.
#
# Coolify deploys on git push to its connected repo, OR via a per-app deploy hook.
# Set COOLIFY_DASHBOARD_DEPLOY_HOOK (Coolify → dashboard app → Webhooks) in .env.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DASH_DIR="${DASHBOARD_DIR:-$ROOT/app/command-center}"   # Astro SSR Command Center build

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ROOT/.env"
  set +a
fi

[[ -d "$DASH_DIR" ]] || {
  echo "✗ no dashboard at $DASH_DIR"
  echo "  Expected the production Astro Command Center under app/command-center."
  exit 1
}

# Build locally to catch errors before Coolify does (optional but cheap)
if command -v npm >/dev/null && [[ -f "$DASH_DIR/package.json" ]]; then
  echo "▸ Building Astro dashboard"
  ( cd "$DASH_DIR" && npm ci && npm run build )
fi

if [[ -n "${COOLIFY_DASHBOARD_DEPLOY_HOOK:-}" && "${COOLIFY_DASHBOARD_DEPLOY_HOOK}" != "__set_me__" ]]; then
  echo "▸ Triggering Coolify deploy"
  auth=()
  if [[ -n "${COOLIFY_API_TOKEN:-}" && "${COOLIFY_API_TOKEN}" != "__set_me__" ]]; then
    auth=(-H "Authorization: Bearer ${COOLIFY_API_TOKEN}")
  fi
  curl -fsS -X GET "${auth[@]}" "$COOLIFY_DASHBOARD_DEPLOY_HOOK" >/dev/null \
    && echo "✓ Coolify deploy triggered." \
    || { echo "✗ Coolify deploy hook failed"; exit 1; }
else
  echo "✗ COOLIFY_DASHBOARD_DEPLOY_HOOK not set."
  echo "  Either push to the Coolify-connected branch manually, or add the dashboard deploy hook to .env."
  echo "  In Coolify, set the command-center env server-side: SUPABASE_URL/PUBLIC_SUPABASE_URL plus SUPABASE_SERVICE_ROLE_KEY."
  exit 1
fi
