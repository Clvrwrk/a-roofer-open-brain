---
phase: 2
slug: multi-location-full-ingestion
status: partial
verified: 2026-06-30
verdict: machinery-complete-proven; full-ingestion deferred to Phase 3 (cron-paced)
---

# Phase 2 — Verification (Multi-Location Full Ingestion)

> Goal-backward verification against the 4 ROADMAP success criteria, checked against the LIVE prod DB (`rnhmvcpsvtqjlffpsayu`) on 2026-06-30.

## Verdict

**PARTIAL — machinery built, deployed, and proven on real production data; full ingestion breadth + within-tolerance reconciliation are cron-paced and explicitly deferred to Phase 3.**

The 4 plans executed (56/56 unit tests GREEN, `acculynx-sync` v19 deployed, migrations 168–171 applied to prod). Multi-account serial fan-out is proven correct on live data with **zero cross-account bleed**. What is NOT done is the actual completion of the historical backfill across all resources/accounts — that is thousands of rate-limited (30 req/s) calls that belong to Phase 3's hourly-cron + budget hardening, not a one-session brute-force.

## Per-Criterion Findings (live evidence)

### SC1 — Every row stamped with source account/market; no cross-account bleed
**SUBSTANTIALLY MET.**
- `acculynx_jobs`: kansas_city 166, wichita 1,284, **0 NULL, 0 bleed**. (1,259 Phase-1 legacy rows backfilled to `wichita`/`sedgwick_ks` 2026-06-30 — provenance: KS-prefixed job numbers synced via the legacy wichita watermark; human-approved.)
- `acculynx_contacts`: kansas_city 70, wichita 62, 3 NULL.
- Cross-account bleed: **none** — the only non-null `account_key` values anywhere are `kansas_city` and `wichita`.
- **Open:** 8 tiny legacy non-job rows still NULL (3 contacts, 3 job_contacts, 1 financial, 1 insurance) — likely Phase-1 sandbox artifacts; provenance ambiguous, not auto-stamped. → Phase 3 cleanup.

### SC2 — All 8 unfed resources populated (non-empty) with per-resource watermarks
**PARTIAL.**
- **Populated:** contacts (both accounts). Per-(account_key, resource_type) watermarks now work (migration 171 fixed the single-column PK that blocked them).
- **Not yet populated:** estimates, job-contacts, job-financials, job-insurance, milestone-history, invoices, invoice-lines — these come from the job-walk + full sweeps, which need many paced cron runs over 1,450 jobs. → Phase 3.

### SC3 — Full historical backfill, windowed, resumable, with diff detection
**PARTIAL.**
- Backfill **runs and resumes** (full-history floor + `last_walked_job_id`/`last_page_index`; unblocked by migration 171). Currently ~5% in (wichita contacts 62/1,312).
- Diff detection (`markNotSeen`, update-only — never delete) is implemented for full-sweep resources; fires after a complete sweep, so it activates as the backfill completes. → completes over Phase 3 cron.

### SC4 — Row counts reconcile within acceptable tolerance
**MECHANISM MET; TOLERANCE NOT YET.**
- `v_acculynx_reconciliation` returns rows with a computed `delta_pct` (was blind before — `last_api_count` now persisted).
- Not within tolerance: backfill is early (wichita contacts delta 95.3%). **Known bug:** jobs `last_api_count` stores `1` instead of the true total → jobs reconciliation is currently meaningless. → fix + reconcile-to-tolerance in Phase 3.

## Bugs found & fixed during production verification (value of subset-first)
1. camelCase→snake_case PostgREST field mapping (silent rejects)
2. AccuLynx jobs API requires `endDate` (silent 400s)
3. `acculynx_jobs` FK on `lead_source_id` → upsert lead_sources first
4. `syncJobs` infinite loop — break on `offset >= count`
5. `syncJobs` must return `maxModifiedDate` for watermark advancement
6. `advanceWatermark` now persists `last_api_count`
7. Migration 171 — watermark composite PK `(account_key, resource_type)`

## Carry-forward to Phase 3 (Commercial Cron Hardening)
1. Complete the KC + Wichita backfill to within tolerance (contacts → estimates → job-walk sub-resources) via hourly cron.
2. Fix jobs `last_api_count` to store the true API total (unblinds jobs reconciliation).
3. Stamp/triage the 8 remaining legacy NULL non-job rows.
4. Expand fan-out to the remaining 6 production accounts (florida, colorado, georgia, texas, insurance_program, multi_family_commercial) — set their Edge secrets after KC+Wichita reconcile within tolerance; human-approved scope step.

## Production state at verification
- Deployed: `acculynx-sync` v19 (rollback target v12).
- Edge secrets set: sandbox + kansas_city + wichita only (other 6 intentionally absent → physically cannot fan out to them).
- Migrations live: 168, 169, 170, 171.
