<!-- Cap: 2,500 chars. Curated working snapshot; update sparingly. -->
# Working Memory

## ▶ Pick up here
**Handoff: `docs/handoffs/current.md` + daily log.** **Invoice-audit overhaul (06-22): P1–P3 DEPLOYED (origin/main)** — one-UOM-per-row + correct variance on ALL price surfaces via new `@lib/uom` (docs46); coverage "Build agreement →" deep-link; resumable progress primitive `scripts/progress-checklist.ts`. **P4 START HERE (foundation on main; branch fresh):** Global Price List view `v_price_list_global` (mig 143) applied to prod (per office: lowest-open-inv/API/min·max·mean negotiated across the 2hr `pricing_territory_office_id` territory; canonical UOM). **TODO:** `v_price_list_branch` (current + immediate-last-archived negotiated), archived-agreements view (newest→oldest), then nested Price List Review UI (PE Office→Global→Vendor→Branch→Current/Archived) reusing the progress primitive. Locked: 2hr=office isochrone (schema70, NOT forked); open=`ar_status='open'`.
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
Source = GitHub `Clvrwrk/a-roofer-open-brain`; **LIVE = `origin/main`** (Coolify auto-builds). Dev = origin/main = live (confirm HEAD via `/healthz` buildCommit, not a memorized hash). `git push origin HEAD:main` deploys. **Local `main` drifts stale between sessions — always `git fetch` then branch from `origin/main`.** Supabase `rnhmvcpsvtqjlffpsayu`; schemas mirrored thru **143**. Build: `cd app/command-center && npm run build`.
