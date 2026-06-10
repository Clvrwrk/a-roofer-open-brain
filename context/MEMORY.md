<!-- Cap: 2,500 chars. Curated working snapshot; update sparingly. -->
# Working Memory

## Active Threads

- Command Center runs from `app/command-center` with Supabase product surface and WorkOS/auth.md discovery skeleton merged on `main`.
- Memory Phase 1 validated 2026-06-10 (hook, skill, SOUL.md, caps, recall). Remaining: install MemSearch plugin in Claude Code + rebuild Mac index — see `docs/handoffs/current.md`.
- Spec `docs/33` v1.1 (twin learning loops, autoresearch pattern) awaits review; next build: Phase 1 Supabase schema (`estimate_*`/`kb_*`).
- Raw imports are parked in `archive/local-uncommitted-2026-06-04/` pending Maintenance sanitize/extract manifest.

## Environment Notes

- Command Center local URL: `http://127.0.0.1:4326/`.
- Supabase project: `rnhmvcpsvtqjlffpsayu` (`https://rnhmvcpsvtqjlffpsayu.supabase.co`).
- Public Command Center origin: `https://cc.proexteriorsus.net` (Coolify configured; DNS cutover pending).
- `memsearch` 0.4.6 at `/Users/chussey/.local/bin/memsearch`. Mac index is stale — rebuild with `bash scripts/memsearch-index-open-brain.sh` (110 chunks verified from markdown 2026-06-10).
- `.env` holds real local secrets; `config/.env.example` is names-only. Never copy `.env` into the template.
- ABC Supply sandbox credentials are present locally under generic portal labels; add/use namespaced aliases `ABC_SUPPLY_CLIENT_ID`, `ABC_SUPPLY_CLIENT_SECRET`, and `ABC_SUPPLY_ENV=sandbox`.

## Pending Decisions

- Add WorkOS env vars before enabling real human auth: `WORKOS_API_KEY`, `WORKOS_CLIENT_ID`, `WORKOS_COOKIE_PASSWORD`, `WORKOS_REDIRECT_URI`, `COMMAND_CENTER_AUTH_MODE=workos`.
- Add Sentry env names before MCP/CLI auth: `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`.
- Define the sanitizer for archived website, pricing/accounting, and property-enrichment imports before indexing or committing extracted knowledge.
- Confirm ABC sandbox credential track/scopes before read-only bridge tests; no order/webhook writes until human review.
