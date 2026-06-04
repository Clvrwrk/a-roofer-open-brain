#!/usr/bin/env bash
# verify-deployment.sh — end-to-end smoke test + go-live gate (docs/06).
# Exits non-zero if any CRITICAL check fails. Safe to run repeatedly.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PASS=0; FAIL=0; WARN=0
ok()   { printf "\033[1;32m✓ %s\033[0m\n" "$*"; PASS=$((PASS+1)); }
bad()  { printf "\033[1;31m✗ %s\033[0m\n" "$*"; FAIL=$((FAIL+1)); }
warn() { printf "\033[1;33m! %s\033[0m\n" "$*"; WARN=$((WARN+1)); }
is_set() {
  [[ -n "${1:-}" && "$1" != "__set_me__" && "$1" != *"YOUR-PROJECT"* && "$1" != *"CLIENT"* && "$1" != "null" ]]
}

echo "== a-roofers-open-brain :: deployment verification =="

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ROOT/.env"
  set +a
fi

# 1. Secrets present (names from config/.env.example)
if [[ -f "$ROOT/.env" ]]; then
  ok ".env present"
  for k in SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY OB_ACCESS_KEY_HISTORIAN BRAIN_MCP_URL; do
    if grep -q "^${k}=" "$ROOT/.env" && is_set "${!k:-}"; then ok "env: $k set"; else bad "env: $k missing or placeholder"; fi
  done
else bad ".env missing"; fi

# 2. No secrets committed to git history (CRITICAL)
if git -C "$ROOT" rev-parse >/dev/null 2>&1; then
  if git -C "$ROOT" ls-files | grep -E '(^|/)\.env$' >/dev/null; then
    bad ".env is tracked by git — remove it from the index"
  else ok ".env is not tracked by git"; fi
  if git -C "$ROOT" grep -nIE 'xox[baprs]-[A-Za-z0-9-]{20,}|xapp-[A-Za-z0-9-]{20,}|sbp_[A-Za-z0-9_]{20,}|-----BEGIN|SUPABASE_SERVICE_ROLE_KEY=eyJ[A-Za-z0-9_-]{20,}' -- . ':!*.example*' ':!config/.env.example' ':!scripts/verify-deployment.sh' >/dev/null 2>&1; then
    warn "possible secret-shaped strings in tracked files — review"
  else ok "no obvious secret strings in tracked files"; fi
else warn "not a git repo yet — run git init"; fi

# 3. Schema: required tables exist (CRITICAL) — needs SUPABASE_DB_URL + psql
if command -v psql >/dev/null && is_set "${SUPABASE_DB_URL:-}"; then
  for t in thoughts property jurisdiction regulatory_snapshot client job insurance_claim manufacturer_warranty atom_access_log; do
    if psql "$SUPABASE_DB_URL" -tAc "select to_regclass('public.$t')" 2>/dev/null | grep -q "$t"; then
      ok "table public.$t exists"
    else bad "table public.$t missing"; fi
  done
  # RLS enabled on every Cleverwork table
  for t in thoughts property jurisdiction regulatory_snapshot inspector_notes client job crew insurance_claim manufacturer_warranty atom_access_log; do
    rls=$(psql "$SUPABASE_DB_URL" -tAc "select relrowsecurity from pg_class where relname='$t'" 2>/dev/null)
    [[ "$rls" == "t" ]] && ok "RLS enabled on $t" || bad "RLS NOT enabled on $t"
  done
else warn "psql/SUPABASE_DB_URL unavailable — skipping live schema checks"; fi

# 4. Server tests (offline, mock DB)
if command -v deno >/dev/null; then
  if (cd "$ROOT/server" && deno test --quiet tests/ >/dev/null 2>&1); then ok "server smoke tests pass"
  else bad "server smoke tests failed (cd server && deno test tests/)"; fi
else warn "deno unavailable — skipping server tests"; fi

# 5. MCP container reachable (tools/list)
if is_set "${BRAIN_MCP_URL:-}" && is_set "${OB_ACCESS_KEY_HISTORIAN:-}" && command -v curl >/dev/null; then
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BRAIN_MCP_URL" \
    -H "x-ob-access-key: $OB_ACCESS_KEY_HISTORIAN" -H "Content-Type: application/json" \
    -d '{"method":"tools/list"}' 2>/dev/null)
  [[ "$code" == "200" ]] && ok "brain-mcp tools/list → 200" || warn "brain-mcp tools/list → ${code:-no response}"
else warn "BRAIN_MCP_URL / access key unset — skipping live MCP ping"; fi

# 6. Dashboard reachable (if configured)
if is_set "${DASHBOARD_URL:-}" && command -v curl >/dev/null; then
  code=$(curl -s -o /dev/null -w "%{http_code}" "$DASHBOARD_URL" 2>/dev/null)
  [[ "$code" == "200" ]] && ok "dashboard → 200" || warn "dashboard → ${code:-no response}"
else warn "DASHBOARD_URL unset — skipping dashboard ping"; fi

# 7. Design system: brand DESIGN.md lints clean + Tailwind v3 theme in sync (standards/design/v1.md)
DESIGN_MD="$ROOT/config/brand/DESIGN.md"
TW_THEME="$ROOT/config/brand/tailwind.theme.json"
DESIGNMD_VERSION="${DESIGNMD_VERSION:-latest}"
if [[ -f "$DESIGN_MD" ]]; then
  if command -v npx >/dev/null; then
    lint_out=$(npx --yes "@google/design.md@${DESIGNMD_VERSION}" lint "$DESIGN_MD" 2>/dev/null)
    if echo "$lint_out" | grep -qE '"errors":[[:space:]]*0\b'; then
      ok "DESIGN.md lints clean (0 errors)"
    else
      bad "DESIGN.md has lint errors — run scripts/lint-design.sh"
    fi
    # Tailwind v3 theme must match what DESIGN.md derives (drift gate)
    if [[ -f "$TW_THEME" ]]; then
      tmp_theme=$(mktemp)
      if npx --yes "@google/design.md@${DESIGNMD_VERSION}" export --format json-tailwind "$DESIGN_MD" 2>/dev/null > "$tmp_theme" && [[ -s "$tmp_theme" ]]; then
        if diff -q "$tmp_theme" "$TW_THEME" >/dev/null 2>&1; then
          ok "Tailwind v3 theme in sync with DESIGN.md"
        else
          bad "Tailwind v3 theme stale — regenerate: npx @google/design.md export --format json-tailwind config/brand/DESIGN.md > config/brand/tailwind.theme.json"
        fi
      else warn "could not derive Tailwind theme (export failed) — review @google/design.md"; fi
      rm -f "$tmp_theme"
    else bad "config/brand/tailwind.theme.json missing — generate it from DESIGN.md"; fi
  else warn "npx (Node) unavailable — skipping DESIGN.md lint + theme sync check"; fi
else warn "config/brand/DESIGN.md absent — no brand tokens to verify"; fi

echo ""
echo "== summary: $PASS passed, $WARN warnings, $FAIL failed =="
[[ $FAIL -eq 0 ]] || { echo "go-live gate: BLOCKED (see docs/06-security-checklist.md)"; exit 1; }
echo "go-live gate: CLEAR"
