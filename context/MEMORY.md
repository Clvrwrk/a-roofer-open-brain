<!-- Cap: 2,500 chars. Curated working snapshot; update sparingly. -->
# Working Memory

## ▶ Pick up here
**Handoff: `docs/handoffs/current.md` (2026-06-26) + daily log.** Both stranded streams converged onto `origin/main`, tree clean: Track A (perf + 7-agent fleet/crons), Track B StormWatch/ZoomInfo committed `31fc04c` (docs 47–54, schemas 147–152), Track C Invoice "To Be Paid" CSV + ledger `6600516` (schema 153). 10 merged branches deleted; perf-review worktree removed.
**NEXT:** verify Track C (invoice unit tests + build — UNVERIFIED), apply additive migs 147–153 to prod if missing, then close 4 open branches: `db-price-foundation-round4` (apply?), `db-price-foundation-round3` (⊂ round4→delete), `vendor-territory-map` (superseded→delete), `coderabbit-config` (adopt CI or drop).
**OPEN:** Denver/Dallas GPA promotion, July price crons, ABC full prod-sync on persistent host. **Stormwatch deploy PAUSED** pending Reonomy finalization + property-layer validation (committing artifacts ≠ deploy).

## Standing instructions (Chris)
- **Vendor data = official API docs FIRST, then `<vendor>-api` data-map skill.**
- **Verify against the LIVE DB, not migration files.**
- **Validation layer on every agent** (adversarial verifier).
- **Zero external sends (v1):** agents draft; humans send.
- **Dashboards share one shape** (docs/40): PE Office→Vendor/Branch→Category→Item.

## Playbooks (docs/42)
1. ABC mapping drift (flat vs nested→null; COALESCE from `raw`). 2. UOM: compare in ABC pricing UOM = `price_per_uom`; align orders via `v_item_uom_map` (migs 119-122, docs/46). 3. PostgREST 1000-row cap → `.range()`. 4. Invoice branch/office from `raw->'branch'`. 5. OCR vendor docs via Unstructured `hi_res` → match item# to catalog (pg_trgm fixes OCR slips).

## Environment / Deploy
Source = GitHub `Clvrwrk/a-roofer-open-brain`; **LIVE = `origin/main`** (Coolify auto-builds). Dev = origin/main = live (confirm HEAD via `/healthz` buildCommit, not a memorized hash). `git push origin HEAD:main` deploys. **Local `main` drifts stale between sessions — always `git fetch` then branch from `origin/main`.** Supabase `rnhmvcpsvtqjlffpsayu`; schemas mirrored thru **153**. Build: `cd app/command-center && npm run build`.
