<!-- Cap: 2,500 chars. Curated working snapshot; update sparingly. -->
# Working Memory

## ▶ Pick up here
**Handoff: `docs/handoffs/current.md` + daily log.** Invoice-audit P1–P4 is complete on `origin/main` (see docs/46 + migrations 143–144). Price list hierarchy and UOM normalization are locked.
**OPEN:** Denver/Dallas GPA promotion, July price crons, and ABC full prod-sync on persistent host. **Stormwatch forensic baseline now published:** `docs/54-stormwatch-forensic-review-2026-06-25.md` + `scripts/stormwatch/stormwatch_preflight.py` + `.codex/skills/stormwatch-live-run-ops/SKILL.md`. **Stormwatch deploy status is PAUSED** pending Reonomy relationship finalization + property-layer validation (see `docs/handoffs/current.md` pause notice).

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
