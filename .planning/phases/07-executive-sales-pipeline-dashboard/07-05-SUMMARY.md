---
phase: 07-executive-sales-pipeline-dashboard
plan: 05
subsystem: api
tags: [supabase, deno, edge-function, acculynx, postgrest, capture-first]

# Dependency graph
requires:
  - phase: 07-executive-sales-pipeline-dashboard
    provides: "D-14 capture-first / map-second architecture decision, migration 169 (job-walk sub-resource table DDL), migration 177 (RLS deny-by-default pattern), migration 176 (check_acculynx_alerts baseline)"
provides:
  - "acculynx_job_walk_errors table + fifth check_acculynx_alerts() condition (applied to prod)"
  - "lib/mappers.ts — six pure raw->typed snake_case mappers for job-walk sub-resources"
  - "job-walk.ts rebuilt on capture-first / mapped-upsert / counted-error / upsert-watermark contract"
affects: ["07-06", "07-07", "financial/margin KPI plans that read acculynx_job_financials, acculynx_job_insurance, acculynx_invoices, acculynx_invoice_lines"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Capture-first / map-second (D-14): every per-job GET body archived to acculynx_raw BEFORE any typed mapping — a mapping failure never loses the payload"
    - "Explicit snake_case mapper functions (no raw-object spread into typed upsert rows) — same convention as resources/jobs.ts mapJob()"
    - "Counted, queryable failure surface (acculynx_job_walk_errors) replacing console.warn-only error handling, wired into check_acculynx_alerts()"
    - "Shared advanceWatermark() upsert helper for watermark advancement instead of inline .update().eq() (works on unseeded accounts)"

key-files:
  created:
    - schemas/cleverwork-roofer/186-acculynx-job-walk-error-surface.sql
    - supabase/functions/acculynx-sync/lib/mappers.ts
    - supabase/functions/acculynx-sync/lib/mappers.test.ts
  modified:
    - supabase/functions/acculynx-sync/resources/job-walk.ts
    - supabase/functions/acculynx-sync/resources/job-walk.test.ts
    - supabase/functions/acculynx-sync/index.ts

key-decisions:
  - "Consolidated per-sub-resource error recording into a shared recordWalkError() helper (DRY) rather than six inline console.warn-replacement blocks — functionally identical to the plan's literal-text acceptance-criteria grep, verified instead via a forced-failure test asserting exactly one acculynx_job_walk_errors insert with correct account_key/job_id/resource_type/sync_batch_id/error_message."
  - "Threaded sync_batch_id through syncJobWalk() as a new optional trailing parameter and through runAccountSync() (index.ts) as a new required parameter, so acculynx_raw archive rows and acculynx_job_walk_errors rows can be cross-referenced to a single sync run."

patterns-established:
  - "Mapper context object ({account_key, market, now, job_id?, invoice_id?}) threaded per-call rather than per-mapper-instance — keeps mappers pure/stateless and testable without a DB."

requirements-completed: [REQ-10]

coverage:
  - id: D1
    description: "lib/mappers.ts exports six pure mappers (mapJobContact, mapJobFinancials, mapJobInsurance, mapMilestoneHistoryItem, mapInvoiceHeader, mapInvoiceLine) producing exactly the snake_case columns migration 169 defines per table; unknown API keys never leak into typed columns; missing fields default to null; KS-11 financials ground truth (approved_job_value 30368.48, balance_due 17532.48) asserted."
    requirement: "REQ-10"
    verification:
      - kind: unit
        ref: "supabase/functions/acculynx-sync/lib/mappers.test.ts (18 tests, all six mappers x exact-mapping/unknown-key/null-default)"
        status: pass
    human_judgment: false
  - id: D2
    description: "job-walk.ts rebuilt: every per-job GET (contacts, financials, insurance, milestone-history, invoices, invoice line items) is archived to acculynx_raw BEFORE the typed mapped upsert (D-14 capture-first); every typed-upsert failure is recorded as a counted acculynx_job_walk_errors row instead of console.warn; the job_walk watermark advances via the shared advanceWatermark() upsert helper (works on an unseeded account)."
    requirement: "REQ-10"
    verification:
      - kind: unit
        ref: "supabase/functions/acculynx-sync/resources/job-walk.test.ts (7 tests: capture-first ordering, forced-error → counted acculynx_job_walk_errors insert, watermark upsert on unseeded account, budget-stop, two-level invoice walk)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Migration 186 (acculynx_job_walk_errors table, deny-by-default RLS, fifth check_acculynx_alerts() condition) applied to prod rnhmvcpsvtqjlffpsayu and verified live: table exists with 0 rows, check_acculynx_alerts() runs clean returning 1 (single firing condition is the known pre-existing 21-stale-watermarks state; conditions a/c/d/e all 0), zero anon/authenticated grants."
    requirement: "REQ-10"
    verification:
      - kind: manual_procedural
        ref: "Task 1b checkpoint — orchestrator applied migration 186 to prod with human approval; confirmed via list_tables, select count(*), select check_acculynx_alerts()"
        status: pass
    human_judgment: false

duration: ~35min (Tasks 2-3, this continuation session; Task 1/1b executed in a prior session)
completed: 2026-07-02
status: complete
---

# Phase 7 Plan 05: Job-walk capture-first rebuild + counted error surface Summary

**Rebuilt AccuLynx job-walk.ts on the D-14 capture-first contract — raw archive before mapping, explicit snake_case mappers instead of camelCase spreads, counted acculynx_job_walk_errors instead of console.warn, and an upsert-based watermark — closing the root-cause defect class beneath the Executive dashboard's margin/financial KPIs.**

## Performance

- **Duration:** ~35 min (this continuation session, Tasks 2-3 only; Task 1 + prod-apply checkpoint ran in a prior session)
- **Completed:** 2026-07-02T15:29:01Z
- **Tasks:** 3 (Task 1 migration authoring, Task 1b prod-apply checkpoint, Task 2 mappers, Task 3 job-walk rebuild)
- **Files modified:** 6 (3 created, 3 modified)

## Accomplishments
- `acculynx_job_walk_errors` table + fifth `check_acculynx_alerts()` condition applied to prod and verified live (migration 186)
- `lib/mappers.ts`: six pure raw→typed snake_case mappers for all job-walk sub-resource tables, with 18 passing tests including the KS-11 financials ground truth
- `job-walk.ts` fully rebuilt: every per-job GET archived to `acculynx_raw` first, mapped upserts via the new mappers, upsert failures recorded as counted/alertable rows, watermark advanced via the shared `advanceWatermark()` upsert helper
- `sync_batch_id` threaded from `index.ts` through `runAccountSync()` into `syncJobWalk()` so raw-archive and error rows can be cross-referenced to a single sync run

## Task Commits

Each task was committed atomically:

1. **Task 1: Migration 186 — counted job-walk error surface + fifth alert condition** - `7ec14d4` (feat)
2. **Task 1b: Apply migration 186 to prod** - n/a (DB action; orchestrator, human-approved checkpoint)
3. **Task 2: lib/mappers.ts — explicit raw->typed snake_case field maps** - `48714d4` (feat)
4. **Task 3: Rewrite job-walk.ts — capture-first, mapped upserts, counted errors, upsert watermark** - `703b083` (feat)

**Plan metadata:** (this commit — docs: complete plan)

## Files Created/Modified
- `schemas/cleverwork-roofer/186-acculynx-job-walk-error-surface.sql` - acculynx_job_walk_errors table (deny-by-default RLS) + fifth check_acculynx_alerts() condition; applied to prod
- `supabase/functions/acculynx-sync/lib/mappers.ts` - six pure mappers: mapJobContact, mapJobFinancials, mapJobInsurance, mapMilestoneHistoryItem, mapInvoiceHeader, mapInvoiceLine
- `supabase/functions/acculynx-sync/lib/mappers.test.ts` - 18 tests covering exact-key mapping, unknown-key exclusion, null defaults, KS-11 ground truth
- `supabase/functions/acculynx-sync/resources/job-walk.ts` - rebuilt: raw-archive-first, mapped upserts, counted errors via recordWalkError(), advanceWatermark() upsert
- `supabase/functions/acculynx-sync/resources/job-walk.test.ts` - extended: capture-first ordering, forced-error counted-insert assertion, unseeded-watermark upsert assertion
- `supabase/functions/acculynx-sync/index.ts` - threaded batchId through runAccountSync() → syncJobWalk() call site

## Decisions Made
- Consolidated the six sub-resource error-recording call sites into one shared `recordWalkError()` helper rather than six inline console.warn replacements — this makes the literal string `acculynx_job_walk_errors` appear fewer times textually than the plan's acceptance-criteria grep (`>= 6`) expected, but every one of the six sub-resource upsert-failure paths calls the helper (verified: 6 call sites at lines 189/214/239/266/295/325), and the behavior is directly proven by a forced-failure test asserting exactly one `acculynx_job_walk_errors` insert with the correct fields. Functional equivalence over literal-grep compliance — DRY reduces the surface for a future missed error path.
- `sync_batch_id` added as a new parameter to both `syncJobWalk()` (optional, trailing) and `runAccountSync()` (required, threaded from the existing `batchId` in `index.ts`) so raw-archive and error rows carry the same batch correlation the rest of the sync pipeline already uses.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `runAccountSync()` did not accept `batchId`, but `syncJobWalk()` needed it to stamp raw-archive/error rows**
- **Found during:** Task 3 (job-walk.ts rebuild)
- **Issue:** The plan's action text says "Thread a sync_batch_id parameter through syncJobWalk (index.ts already has batchId; pass it in)," but `batchId` was in scope inside `index.ts`'s top-level handler, not inside `runAccountSync()` (the function that actually calls `syncJobWalk()`). Passing `batchId` directly would have been a compile error (name not in scope).
- **Fix:** Added `batchId: string` as a fourth parameter to `runAccountSync()` and updated its single call site to pass the batch's `batchId` through.
- **Files modified:** `supabase/functions/acculynx-sync/index.ts`
- **Verification:** `deno check index.ts` passes with no errors; `deno test` for job-walk.test.ts confirms `sync_batch_id` reaches the raw-archive and error-insert rows.
- **Committed in:** `703b083` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary to compile; no scope creep — the fix is a pure parameter-threading change matching the plan's stated intent.

## Issues Encountered
- The plan's acceptance-criteria grep for Task 3 (`grep -c 'acculynx_job_walk_errors' ... >= 6`) does not match the implementation because error recording was consolidated into a single shared helper. Documented above under Decisions Made; functional correctness is proven by tests instead.
- Two pre-existing failures in `lib/accounts.test.ts` (`resolveKey` tests) surfaced when running `deno test` across the whole `acculynx-sync` directory without `--allow-env`. These are unrelated to this plan's files, pre-date this session, and pass cleanly when run with `deno test lib/accounts.test.ts --allow-env`. Out of scope per the SCOPE BOUNDARY rule — not fixed, logged here for visibility.

## User Setup Required
None - no external service configuration required. The edge function is not deployed by this plan (07-09 owns the deploy per phase sequencing).

## Next Phase Readiness
- The raw archive + mapper foundation this plan built is the prerequisite Wave 6 (07-06, crm_pipeline restoration) needs before financial/insurance data can be mapped forward into the CRM pipeline view.
- `acculynx_job_walk_errors` is live on prod and wired into `check_acculynx_alerts()`; the next real sync run (once the edge function is deployed in 07-09) will start populating it and the six sub-resource tables with correctly mapped data instead of near-100%-rejected raw spreads.
- No blockers. Nothing was pushed to origin and the edge function was not deployed, per this plan's sequential-execution contract.

---
*Phase: 07-executive-sales-pipeline-dashboard*
*Completed: 2026-07-02*

## Self-Check: PASSED

All 6 claimed artifact files found on disk; all 3 task commits (7ec14d4, 48714d4, 703b083) found in git log.
