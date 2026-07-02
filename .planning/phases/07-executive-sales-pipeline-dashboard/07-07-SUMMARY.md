---
phase: 07-executive-sales-pipeline-dashboard
plan: 07
subsystem: api
tags: [dashboard, dedup, crm_pipeline, executive-pipeline, docs, doc-drift, acculynx]

# Dependency graph
requires:
  - phase: 07-executive-sales-pipeline-dashboard
    provides: "07-05's capture-first raw-archive concept and 07-06's crm_pipeline restoration (syncCrmPipeline, D-14..D-18) — the architecture Task 2's doc rewrite describes."
provides:
  - "dedupePipeline(rows) — a pure function collapsing crm_pipeline rows that share an acculynx_job_id, preferring data_source === 'api_sync', wired into both the main dashboard loader and the per-location drill-down loader before any KPI aggregation."
  - "docs/knowledge-base/acculynx/ingestion/sync-pipeline.md corrected to describe the live D-14..D-18 pipeline (capture-first, crm_pipeline on the multiAccount cron, first-sight/change-driven pull, budget rotation, counted job-walk errors) instead of the retired legacySyncJobs-only description."
affects: ["07-08", "07-09 (the deploy plan that verifies the gap-closure fixes live and re-runs the Task 3 dashboard checkpoint)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dedup-before-aggregate: dedupePipeline() runs immediately after the crm_pipeline selectAll and before any exclusion/filter/KPI computation, mirroring the existing excludeClosedAndPaidInFull() single-filter-point pattern already established in this file."
    - "Precedence-by-source-tag: when two rows share a natural key (acculynx_job_id) but originate from different ingestion paths (csv_initial vs api_sync), the more-authoritative source wins deterministically rather than merging fields or picking arbitrarily."

key-files:
  created: []
  modified:
    - app/command-center/src/lib/executive-pipeline.ts
    - app/command-center/src/lib/executive-pipeline.test.ts
    - docs/knowledge-base/acculynx/ingestion/sync-pipeline.md
    - docs/knowledge-base/acculynx/ingestion/index.md

key-decisions:
  - "dedupePipeline() is called at BOTH crm_pipeline entry points (loadExecutivePipelineDashboard's main aggregation path AND jobRowsForLocation's drill-down path) rather than only the aggregate loader — the plan's truth statement says a job must be counted once in EVERY KPI, and the drill-down table is a KPI-adjacent artifact a user could read as showing the same job twice with conflicting values."
  - "Null-acculynx_job_id rows are never merged with each other — they have no join key, and collapsing them would silently drop distinct legacy jobs that happen to share no id. Only rows with a matching NON-null acculynx_job_id are candidates for merge."
  - "sync-pipeline.md's Phase 7 gap-closure section explicitly notes the csv/api dedup is a DASHBOARD-SIDE (read-time) mitigation, not an ingestion-side fix — the ~5,578 orphaned csv_initial rows without acculynx_job_id are NOT resolved by this plan and are called out under 'Still open' so a future engineer doesn't assume the duplicate-row problem is fully closed at the source."

patterns-established:
  - "Precedence-tagged dedup collapse (dedupePipeline): group-by-key with an explicit tie-break predicate (data_source === 'api_sync'), first-seen fallback, unkeyed rows passed through unmerged — reusable shape for any future crm_pipeline-adjacent multi-source table."

requirements-completed: [REQ-10]

coverage:
  - id: D1
    description: "dedupePipeline(rows) collapses crm_pipeline rows sharing a non-null acculynx_job_id to one row, preferring data_source === 'api_sync'; null-acculynx_job_id rows pass through unmerged; wired into loadExecutivePipelineDashboard before excludeClosedAndPaidInFull/aggregation and into jobRowsForLocation's drill-down path."
    requirement: "REQ-10"
    verification:
      - kind: unit
        ref: "app/command-center/src/lib/executive-pipeline.test.ts describe('csv/api dedup with data_source precedence (VERIFICATION gap 8 / 07-07)') — 5 tests: order-independent api_sync precedence, null-key rows both preserved, first-seen fallback when neither is api_sync, single-row passthrough, KS-11 duplicate-pair funnel/pipeline-value aggregation counts the job once"
        status: pass
    human_judgment: false
  - id: D2
    description: "docs/knowledge-base/acculynx/ingestion/sync-pipeline.md rewritten to describe the live D-14..D-18 architecture: capture-first raw archive before typed mapping, crm_pipeline written by syncCrmPipeline() on the multiAccount hourly cron for all 8 accounts (not the retired legacySyncJobs-only path), full syncJobWalk 7-endpoint per-job walk, D-15 first-sight / D-16 change-driven pull scheduling, D-18 fair-share account rotation, and counted/alertable job-walk write failures (acculynx_job_walk_errors, migration 186) replacing console.warn-only handling. ingestion/index.md summary updated to match."
    requirement: "REQ-10"
    verification:
      - kind: other
        ref: "grep -qi 'acculynx_raw' ... && grep -qi 'crm_pipeline' ... && grep -qiE 'first.sight|modifiedDate|change.driven|rotation' ... && echo OK — passed; grep -ci 'acculynx_raw'=5, grep -ciE D-15/16/18 terms=13, grep -ci 'acculynx_job_walk_errors|check_acculynx_alerts'=6; grep -n legacySyncJobs shows the one remaining mention is correctly framed as historical/retired, not current behavior"
        status: pass
    human_judgment: false

duration: ~25min
completed: 2026-07-02
status: complete
---

# Phase 7 Plan 07: crm_pipeline dedup + ingestion doc-drift correction Summary

**dedupePipeline() collapses csv_initial/api_sync crm_pipeline duplicates with api_sync precedence at both the main dashboard loader and the drill-down loader, and sync-pipeline.md is rewritten to describe the live D-14..D-18 capture-first/crm_pipeline-restored/first-sight-pull/budget-rotation pipeline instead of the retired legacySyncJobs-only path.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-07-02T15:44:00Z
- **Completed:** 2026-07-02T15:50:25Z
- **Tasks:** 2 (both autonomous, no checkpoints)
- **Files modified:** 4

## Accomplishments
- `dedupePipeline(rows: PipelineRow[]): PipelineRow[]` added to `executive-pipeline.ts`: groups rows by non-null `acculynx_job_id`, keeps the `data_source === 'api_sync'` row when one exists in the group (else the first row seen), passes null-`acculynx_job_id` rows through unmerged
- Wired into `loadExecutivePipelineDashboard` immediately after the `crm_pipeline` `selectAll` and before `excludeClosedAndPaidInFull`/any KPI aggregation, so every funnel count, pipeline-value sum, and close-rate ratio counts each job once
- Also wired into `jobRowsForLocation` (the per-location drill-down loader used by `loadJobsForLocation`), so the drill-down table never shows the same job twice with conflicting values either
- 5 new vitest cases including a direct KS-11-shaped duplicate pair (stale csv_initial estimate vs `$0` api_sync row) proving the funnel counts the job once and the pipeline-value aggregate uses the api_sync amount
- `sync-pipeline.md` rewritten: Architecture diagram now shows the per-account 5-step sequence (jobs/contacts/estimates/job-walk/crm-pipeline) instead of the old single collapsed "upsert acculynx_jobs + crm_pipeline" line; new "Pull scheduling" section documents D-15/D-16; "How it paces" section documents D-18 fair-share rotation; "Where it lands" now states crm_pipeline IS written by the hourly multiAccount cron (was previously silent/implying the opposite after 07-05/06 landed the code but before this plan corrected the doc); new "Resolved in Phase 7 gap closure" section narrates what 07-05/07-06/07-07 fixed and explicitly flags the dashboard-side dedup as NOT an ingestion-side fix; "Still open" now flags the ~5,578 orphaned csv_initial rows that still can't merge even with dedup (no shared join key)
- `ingestion/index.md`'s one-line sync-pipeline.md summary updated to mention capture-first + the restored crm_pipeline write path

## Task Commits

Each task was committed atomically:

1. **Task 1: csv/api dedup with data_source precedence in the dashboard loader** - `781cd56` (feat)
2. **Task 2: Correct sync-pipeline.md to the live D-14..D-18 architecture** - `c1e587f` (docs)

**Plan metadata:** (this commit — docs: complete plan)

## Files Created/Modified
- `app/command-center/src/lib/executive-pipeline.ts` - added `dedupePipeline()`; call site inserted before `excludeClosedAndPaidInFull` in `loadExecutivePipelineDashboard`; also called at the top of `jobRowsForLocation`
- `app/command-center/src/lib/executive-pipeline.test.ts` - added `dedupePipeline` import and a 5-test `describe` block (order-independent precedence, null-key preservation, first-seen fallback, single-row passthrough, KS-11 aggregation case)
- `docs/knowledge-base/acculynx/ingestion/sync-pipeline.md` - Architecture, Pull scheduling, How it paces, Where it lands, Resolved-in-Phase-3, new Resolved-in-Phase-7-gap-closure, Still open, and Citations sections rewritten/added to match the as-built code (`resources/crm-pipeline.ts`, `resources/job-walk.ts`, migration 186)
- `docs/knowledge-base/acculynx/ingestion/index.md` - one-line sync-pipeline.md summary updated

## Decisions Made
- **Dedup at both crm_pipeline read paths, not just the aggregate loader:** `jobRowsForLocation` (the drill-down table) independently queries `crm_pipeline` via `loadJobsForLocation` and was equally exposed to the KS-11-shaped duplicate problem — deduping only the main KPI loader would have left the drill-down table showing a job twice with conflicting values, contradicting the plan's "counted ONCE in every KPI" truth statement.
- **First-seen fallback, not error, when neither duplicate is api_sync:** the plan's `<action>` explicitly specifies "fall back to the first row if none is api_sync" — implemented literally rather than picking most-recently-updated or another heuristic not specified in the plan.
- **Doc explicitly separates ingestion-side fixes (07-05/07-06) from the dashboard-side mitigation (07-07):** the corrected `sync-pipeline.md` does NOT claim the orphaned csv_initial rows are resolved — it states plainly that dedup happens at dashboard read time and the underlying duplicate rows still exist in `crm_pipeline`, so a future engineer reading the doc won't assume the source-of-truth table itself was cleaned up.

## Deviations from Plan

None - plan executed exactly as written. Both tasks match their `<action>`/`<behavior>` specs; all acceptance-criteria greps and the vitest/build gates pass without needing an auto-fix under Rules 1-3, and no architectural question arose that would trigger Rule 4.

## Issues Encountered
None. Read-first inspection of `index.ts`, `job-walk.ts`, `crm-pipeline.ts`, and migration `186-acculynx-job-walk-error-surface.sql` confirmed every claim added to `sync-pipeline.md` against the actual code and schema (per the CLAUDE.md "verify against the live DB/code" lesson) before writing the doc.

## User Setup Required
None - no external service configuration required. Per the sequential-execution contract for this plan: nothing was pushed to origin (CC deploy is 07-09's sanctioned step).

## Next Phase Readiness
- The Executive Pipeline dashboard loader and its drill-down path now dedup `crm_pipeline` rows by `acculynx_job_id` with `api_sync` precedence — VERIFICATION gap 8 is closed at the read layer.
- `sync-pipeline.md` and `ingestion/index.md` now match the as-built D-14..D-18 pipeline — VERIFICATION gaps 6/9 (doc drift) are closed.
- Full CC vitest suite: 176/176 passing (18 test files); `npm run build` clean.
- Still open (explicitly called out in the corrected doc, not silently dropped): ~5,578 legacy `crm_pipeline` rows lack `acculynx_job_id` entirely and cannot be merged with an `api_sync` twin even by this plan's dedup (no shared join key) — a future backfill would need to resolve `acculynx_job_id` onto these rows from `job_name`/`job_number` if a reliable match exists. This is an ingestion/backfill concern, not something this plan's dashboard-side dedup can address.
- 07-09 (deploy plan) still owns pushing to origin, deploying, and re-running the VERIFICATION.md Task 3 human-verify checkpoint against the live dashboard, now including a check that a duplicate-source job (e.g. KS-11) shows exactly once with the api_sync (live) values.
- No blockers.

---
*Phase: 07-executive-sales-pipeline-dashboard*
*Completed: 2026-07-02*

## Self-Check: PASSED

All 4 claimed files found on disk (executive-pipeline.ts, executive-pipeline.test.ts, sync-pipeline.md, index.md); both task commits (781cd56, c1e587f) found in git log.
