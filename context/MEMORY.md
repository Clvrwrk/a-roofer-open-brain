<!-- Cap: 2,500 chars. Curated working snapshot; update sparingly. -->
# Working Memory

## Active Threads

- Command Center runs from `app/command-center` with Supabase product surface and WorkOS/auth.md discovery skeleton merged on `main`.
- Estimate pipeline (docs/33) BUILT through Phase 6 (2026-06-10): 36 schema tables live, 5 sample runs end-to-end (measurement→GBB scenarios→proposal/internal-estimate PDFs→handoff→order/schedule drafts). Now waits on humans: Roberto's `labor-rates-wichita-v1` approval (observed $80/sq vs $165 placeholder), tier labels, live ABC pull. See `docs/handoffs/current.md`.
- Pricing waterfall (Chris): PDF price list → live API w/ Ops+Acct approval → invoice ≤90d → flag. AccuLynx V2 has NO milestone/invoice/order/schedule writes (docs/37) — fallback permanent.
- Raw imports are parked in `archive/local-uncommitted-2026-06-04/` pending Maintenance sanitize/extract manifest.
- Supabase/Ghost/Dolt infrastructure KBs are complete on `main` at `d51d80a`; use `/supabase-change-preflight` and the new preflight scripts before schema, lab, or data-diff work.

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
