<!-- Cap: 2,500 chars. Curated working snapshot; update sparingly. -->
# Working Memory

## Active Threads

- Command Center runs from `app/command-center` with Supabase product surface and WorkOS/auth.md discovery skeleton merged on `main`.
- MemSearch Codex plugin is installed in user-level hooks/skills. Use curated `context/` files as source-of-truth and `.memsearch/` as generated/plugin runtime state.
- Raw imports are parked in `archive/local-uncommitted-2026-06-04/` pending Maintenance sanitize/extract manifest.

## Environment Notes

- Command Center local URL: `http://127.0.0.1:4326/`.
- Supabase project: `rnhmvcpsvtqjlffpsayu` (`https://rnhmvcpsvtqjlffpsayu.supabase.co`).
- Planned public UI origin: `https://cc.proexteriorsus.net`.
- `memsearch` is available on PATH at `/Users/chussey/.local/bin/memsearch`; observed version: `0.4.6`; `open_brain_memory` indexed 7 chunks.
- `.env` holds real local secrets; `config/.env.example` is names-only. Never copy `.env` into the template.
- ABC Supply sandbox credentials are present locally under generic portal labels; add/use namespaced aliases `ABC_SUPPLY_CLIENT_ID`, `ABC_SUPPLY_CLIENT_SECRET`, and `ABC_SUPPLY_ENV=sandbox`.

## Pending Decisions

- Choose MemSearch backend for shared agent memory: local Milvus Lite for single-user bootstrap, or Zilliz Cloud/Milvus Server for multi-agent shared memory.
- Add WorkOS env vars before enabling real human auth: `WORKOS_API_KEY`, `WORKOS_CLIENT_ID`, `WORKOS_COOKIE_PASSWORD`, `WORKOS_REDIRECT_URI`, `COMMAND_CENTER_AUTH_MODE=workos`.
- Add Sentry env names before MCP/CLI auth: `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`.
- Define the sanitizer for archived website, pricing/accounting, and property-enrichment imports before indexing or committing extracted knowledge.
- Confirm ABC sandbox credential track/scopes before read-only bridge tests; no order/webhook writes until human review.
