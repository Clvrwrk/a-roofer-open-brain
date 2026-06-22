<!-- Cap: 2,500 chars. Curated working snapshot; update sparingly. -->
# Working Memory

## ▶ Pick up here
**Handoff: `docs/handoffs/current.md` + daily log.** **Invoice-audit overhaul + P4 DONE (06-22), all on origin/main.** P1–P3: one-UOM-per-row + correct variance on ALL price surfaces (`@lib/uom`, docs46) + API-price UOM-normalize fix on invoice+order audit (no per-cell /SQ suffix; UOM col is the unit). **P4 = Global Price List review hierarchy** (`/accounting/price-list/review`, nav "Global Price List"): PE Office→Global→Vendor→Branch→Current/Archived. Migs 143–144: `v_price_list_global`, `v_price_list_branch_pricing` (current + immediate-prior price), `v_price_list_branch_agreements` (newest→oldest), `v_pl_branch_office`. Server-renders office+global; lazy per-branch detail; reuses progress primitive. Branches have 1 agreement gen → prior-price/archived EMPTY until next ABC generation (views future-proof). Locked: 2hr=office isochrone (schema70); open=`ar_status='open'`.
**OPEN:** rotate Sentry `sntrys_` build token (chat-exposed)→Coolify; nightly-sync Sentry on agent host; [GPA] Denver/Dallas promote · price crons (2026-07); **ABC FULL prod-sync owed — run on agent host (sandbox caps block it)**.

## Standing instructions (Chris)
- **Vendor data = official API docs FIRST, then `<vendor>-api` data-map skill.**
- **Verify against the LIVE DB, not migration files.**
- **Validation layer on every agent** (adversarial verifier).
- **Zero external sends (v1):** agents draft; humans send.
- **Dashboards share one shape** (docs/40): PE Office→Vendor/Branch→Category→Item.

## Playbooks (docs/42)
1. ABC mapping drift (flat vs nested→null; COALESCE from `raw`). 2. UOM: compare in ABC pricing UOM = `price_per_uom`; align orders via `v_item_uom_map` (migs 119-122, docs/46). 3. PostgREST 1000-row cap → `.range()`. 4. Invoice branch/office from `raw->'branch'`. 5. OCR vendor docs via Unstructured `hi_res` → match item# to catalog (pg_trgm fixes OCR slips).

## Environment / Deploy
Source = GitHub `Clvrwrk/a-roofer-open-brain`; **LIVE = `origin/main`** (Coolify auto-builds). Dev = origin/main = live (confirm HEAD via `/healthz` buildCommit, not a memorized hash). `git push origin HEAD:main` deploys. **Local `main` drifts stale between sessions — always `git fetch` then branch from `origin/main`.** Supabase `rnhmvcpsvtqjlffpsayu`; schemas mirrored thru **144**. Build: `cd app/command-center && npm run build`.
