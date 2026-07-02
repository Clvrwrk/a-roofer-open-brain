---
phase: 07-executive-sales-pipeline-dashboard
plan: 06
subsystem: api
tags: [supabase, deno, edge-function, acculynx, postgrest, capture-first, crm-pipeline]

# Dependency graph
requires:
  - phase: 07-executive-sales-pipeline-dashboard
    provides: "07-05's capture-first job-walk rebuild (lib/mappers.ts, the raw-archive-first contract, sync_batch_id threading) — this plan extends that same job-walk.ts and consumes acculynx_job_financials rows it now correctly populates."
provides:
  - "crm-pipeline.ts — a pure buildPipelineRow() + syncCrmPipeline() resource module restoring the crm_pipeline write path on the multiAccount hourly cron for all 8 accounts"
  - "job-walk.ts: full /jobs/{id}/representatives fetch (not /sales-owner) resolving the company rep to a name, returned as a jobId->repName Map"
  - "job-walk.ts: D-15 first-sight full pull + D-16 change-driven re-pull scheduling (shouldWalkJob) wrapping the existing per-job walk"
  - "index.ts: runAccountSync wired to call syncCrmPipeline after job-walk; D-18 per-account budget rotation (rotating starting account + fair-share deadline) in the fan-out loop"
affects: ["07-07", "07-08", "07-09 (the deploy plan that must verify these gap-closure fixes live before re-running the Task 3 dashboard checkpoint)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Null-safe merge on upsert (T-07-06-01): a field is OMITTED from the row object (not set to null) when this run has no fresh value for it, so ON CONFLICT DO UPDATE never blanks a previously-synced real value with an absent-this-run read."
    - "D-15/D-16 pull scheduling as a wrapper function (shouldWalkJob) around an otherwise-unchanged per-job walk — scheduling logic is separable from what gets pulled once a job is in scope."
    - "D-18 fair-share budget rotation: a persisted watermark-table cursor (account_key='__rotation__') rotates which account leads the fan-out each run; remaining runtime is divided across not-yet-synced accounts, recomputed after each account completes."

key-files:
  created:
    - supabase/functions/acculynx-sync/resources/crm-pipeline.ts
    - supabase/functions/acculynx-sync/resources/crm-pipeline.test.ts
  modified:
    - supabase/functions/acculynx-sync/resources/job-walk.ts
    - supabase/functions/acculynx-sync/resources/job-walk.test.ts
    - supabase/functions/acculynx-sync/index.ts

key-decisions:
  - "primary_salesperson merge is null-safe by KEY OMISSION, not null-send: when no rep name resolves this run, buildPipelineRow() leaves the key out of the row object entirely so the crm_pipeline upsert's ON CONFLICT DO UPDATE never overwrites an existing real name with null (T-07-06-01)."
  - "D-15 first-sight detection joins acculynx_raw to a job via api_endpoint LIKE '%/jobs/{jobId}%' rather than a job_id column, because acculynx_raw has no job_id column — the job id embedded in the archived path is the only available join key."
  - "D-18 rotation cursor reuses the existing acculynx_sync_watermark table (account_key='__rotation__', resource_type='fanout_start') via the proven advanceWatermark()/readWatermark() upsert contract instead of a new table."

patterns-established:
  - "syncJobWalk() now returns Map<jobId, repName> instead of void — the return-value contract other resource modules (syncCrmPipeline) consume rather than a shared mutable side-channel."

requirements-completed: [REQ-10]

coverage:
  - id: D1
    description: "crm-pipeline.ts: syncCrmPipeline(sb, acct, deadline, repNameByJobId, batchId) reads account-scoped acculynx_jobs + acculynx_job_financials and upserts crm_pipeline (onConflict acculynx_job_id, data_source='api_sync'), mapping approved_job_value/balance_due -> contract_amount/balance_due and preserving primary_salesperson null-safely; KS-11 ground truth (30368.48 / 17532.48 / Bob Smolek) asserted."
    requirement: "REQ-10"
    verification:
      - kind: unit
        ref: "supabase/functions/acculynx-sync/resources/crm-pipeline.test.ts (7 tests: KS-11 financials mapping, null-financials case, null-safe salesperson omission, data_source, upsert wiring, onConflict/ignoreDuplicates options, empty-account no-op)"
        status: pass
    human_judgment: false
  - id: D2
    description: "job-walk.ts fetches the FULL /jobs/{jobId}/representatives collection (not the 204-empty-for-KS-11 /representatives/sales-owner sub-path), archives it to acculynx_raw (D-14), resolves the company rep's user.id to a display name via acculynx_users, and returns a Map<jobId, repName> from syncJobWalk() for syncCrmPipeline to consume."
    requirement: "REQ-10"
    verification:
      - kind: unit
        ref: "supabase/functions/acculynx-sync/resources/job-walk.test.ts (3 Task 2a tests: full-collection fetch asserted not sales-owner, KS-11 rep resolves to 'Bob Smolek' in the returned map, representatives body raw-archived)"
        status: pass
    human_judgment: false
  - id: D3
    description: "job-walk.ts implements D-15 first-sight full pull (a job with zero prior acculynx_raw rows always gets the full per-job GET surface) and D-16 change-driven re-pull (a job with prior archives is only re-walked when acculynx_jobs.modified_date is newer than its newest prior archive; an unchanged already-pulled job is skipped, watermark still advances) without regressing the Task 2a rep-map contract."
    requirement: "REQ-10"
    verification:
      - kind: unit
        ref: "supabase/functions/acculynx-sync/resources/job-walk.test.ts (4 Task 2b tests: first-sight triggers full pull, unchanged job skipped, changed job re-walked, rep-map returns correctly after the scheduling wrap)"
        status: pass
    human_judgment: false
  - id: D4
    description: "index.ts: runAccountSync calls syncCrmPipeline after job-walk (passing the resolved repName Map), restoring the crm_pipeline write path on the live multiAccount hourly cron for all 8 accounts. The fan-out loop implements D-18: a persisted rotation cursor rotates the starting account each run, and remaining runtime is fair-shared across not-yet-synced accounts, recomputed after each account completes. The loop stays fully serial (no Promise.all over accounts, T-02-07)."
    requirement: "REQ-10"
    verification:
      - kind: unit
        ref: "deno check index.ts (clean); grep -c 'syncCrmPipeline' index.ts == 3; grep -c rotation/fanout_start/budget-slice terms == 12; no Promise.all present"
        status: pass
      - kind: integration
        ref: "Full acculynx-sync deno test suite: 99/99 passing (mappers, reconcile, watermark, contacts, crm-pipeline, job-walk, jobs) — includes all 25 pre-existing 07-05 tests with zero regressions"
        status: pass
    human_judgment: true
    rationale: "Live cron behavior (crm_pipeline actually populating for all 8 accounts hourly, wichita no longer starved) can only be confirmed against the deployed edge function and production DB — 07-09 owns the deploy and the live re-verification of VERIFICATION.md's Task 3 checkpoint per this plan's sequential-execution contract (not pushed, not deployed here)."

duration: ~50min
completed: 2026-07-02
status: complete
---

# Phase 7 Plan 06: crm_pipeline restoration + full representatives + first-sight pull + budget rotation Summary

**Restored the crm_pipeline write path on the live multiAccount hourly cron (frozen since the Phase 3 cutover), mapped AccuLynx job financials and the full representatives collection forward into contract_amount/balance_due/primary_salesperson, and layered D-15 first-sight / D-16 change-driven pull scheduling plus D-18 per-account budget rotation onto the job walk — closing VERIFICATION gaps 1, 3, and the budget half of gap 4.**

## Performance

- **Duration:** ~50 min
- **Completed:** 2026-07-02
- **Tasks:** 4 (Task 1, 2a, 2b, 3 — all autonomous, no checkpoints)
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments
- `crm-pipeline.ts`: new resource module porting the legacySyncJobs pipelineRows mapping into a pure `buildPipelineRow()` + `syncCrmPipeline()`, adding financials -> contract_amount/balance_due and null-safe primary_salesperson merge (T-07-06-01) — 7 tests green including the KS-11 ground truth (30368.48 / 17532.48 / Bob Smolek)
- `job-walk.ts`: added a 7th per-job step — the FULL `/jobs/{id}/representatives` collection (not the 204-empty `/representatives/sales-owner`), raw-archived and resolved to a name via `acculynx_users`, returned as a `Map<jobId, repName>` from `syncJobWalk()`
- `job-walk.ts`: added `shouldWalkJob()` — D-15 first-sight full pull (no prior `acculynx_raw` rows -> always walk) and D-16 change-driven skip (`modified_date` newer than last archive -> re-walk; otherwise skip, watermark still advances) wrapping the existing walk without altering it
- `index.ts`: `runAccountSync` now calls `syncCrmPipeline` after job-walk succeeds, and the fan-out loop implements D-18 — a persisted rotation cursor (`account_key='__rotation__'`) rotates the starting account each run, and remaining runtime is fair-shared across not-yet-synced accounts (recomputed after each account completes), so colorado can no longer permanently exhaust the shared budget before wichita's turn
- Full `acculynx-sync` test suite: 99/99 green (mappers, reconcile, watermark, contacts, crm-pipeline, job-walk, jobs) — zero regressions on 07-05's capture-first rebuild

## Task Commits

Each task was committed atomically:

1. **Task 1: crm-pipeline.ts — multiAccount crm_pipeline upsert with financials + rep mapping** - `49dca39` (feat)
2. **Task 2a: job-walk.ts — full /representatives fetch + jobId->repName Map** - `765b4bf` (feat)
3. **Task 2b: job-walk.ts — D-15 first-sight full pull + D-16 change-driven skip** - `67f7157` (feat)
4. **Task 3: wire syncCrmPipeline into runAccountSync + D-18 budget rotation** - `21ce4a6` (feat)

**Plan metadata:** (this commit — docs: complete plan)

## Files Created/Modified
- `supabase/functions/acculynx-sync/resources/crm-pipeline.ts` - `buildPipelineRow()` (pure builder, ports the legacy normalizers) + `syncCrmPipeline()` (account-scoped upsert, chunked by 200, deadline-aware)
- `supabase/functions/acculynx-sync/resources/crm-pipeline.test.ts` - 7 tests: KS-11 financials mapping, null-financials case, null-safe salesperson omission, data_source, syncCrmPipeline wiring, onConflict/ignoreDuplicates options, empty-account no-op
- `supabase/functions/acculynx-sync/resources/job-walk.ts` - added `loadUserNameMap()`, `resolveCompanyRepName()`, `shouldWalkJob()`; step 7 (full representatives fetch) added to the per-job loop; `syncJobWalk()` signature gains a `modifiedDateByJobId` param and now returns `Map<jobId, repName>` instead of `void`
- `supabase/functions/acculynx-sync/resources/job-walk.test.ts` - extended mock `sb` to support `acculynx_users.select()` and `acculynx_raw.select().like().order().limit()`; added 7 new tests (3 Task 2a, 4 Task 2b)
- `supabase/functions/acculynx-sync/index.ts` - imported `syncCrmPipeline`; `runAccountSync` calls it after job-walk and returns `crmPipeline` in its result; the multiAccount fan-out entry point gains D-18 rotation-cursor + fair-share-deadline logic (accountFilter still overrides rotation)

## Decisions Made
- **primary_salesperson null-safe merge by key omission (T-07-06-01):** `buildPipelineRow()` only sets `row.primary_salesperson` when a `repName` was resolved this run; otherwise the key is left out of the object entirely, so the upsert's `ON CONFLICT DO UPDATE` clause leaves the column untouched on conflict rather than overwriting a real stored name with `null`. Verified by a dedicated test asserting `hasOwnProperty` is `false`, not `row.primary_salesperson === null`.
- **D-15 first-sight join via `api_endpoint LIKE`:** `acculynx_raw` has no `job_id` column (confirmed by grep across the schema files and the existing `archiveRaw()` call shape), so `shouldWalkJob()` matches prior archives for a job via `api_endpoint LIKE '%/jobs/{jobId}%'` against the path embedded at archive time — the only available join key without a schema change (which this plan does not introduce; no migration was needed or added).
- **D-18 rotation cursor reuses `acculynx_sync_watermark`:** rather than adding a new table for the rotation cursor, it's stored as an ordinary watermark row (`account_key='__rotation__', resource_type='fanout_start'`) via the existing `advanceWatermark()`/`readWatermark()` helpers — zero new schema surface, same proven upsert contract the rest of the sync pipeline already relies on.
- **Fair-share budget is recomputed after each account, not pre-divided once:** `perAccountShareMs` is calculated fresh at the top of each loop iteration from `deadline - Date.now()` divided by the count of accounts not yet processed, so an account that finishes early lets its unused time roll forward to the next account instead of a fixed 1/8th slice being wasted.

## Deviations from Plan

None — plan executed exactly as written. All four tasks (1, 2a, 2b, 3) match their `<action>`/`<behavior>` specs; all acceptance-criteria greps and `deno test`/`deno check` gates pass without needing an auto-fix under Rules 1-3, and no architectural question arose that would trigger Rule 4.

## Issues Encountered
None. The 07-05 test-suite regression risk called out in the execution context (job-walk.ts was JUST rebuilt by 07-05 with the capture-first + mappers + counted-error contract) was the main watch-item — all 7 original 07-05 tests plus the 3 new Task 2a tests plus the 4 new Task 2b tests pass together (14/14 in job-walk.test.ts), confirming the D-15/D-16 scheduling wrap and the representatives-fetch addition did not disturb that contract.

## User Setup Required
None - no external service configuration required. Per the sequential-execution contract for this plan: nothing was pushed to origin, and the edge function was NOT deployed (07-09 owns the deploy per phase sequencing).

## Next Phase Readiness
- `crm-pipeline.ts` + the `syncJobWalk()` repName-Map contract + D-18 rotation are all unit-tested and type-checked but NOT yet live — 07-09 (the deploy plan) must push, deploy, and re-run the VERIFICATION.md Task 3 human-verify checkpoint against the live dashboard to confirm crm_pipeline actually starts populating for all 8 accounts, wichita is no longer starved, and the KS-11 live values match (30368.48 / 17532.48 / Bob Smolek).
- VERIFICATION gap 5 (5,578 orphaned `csv_initial` rows without `acculynx_job_id` causing duplicate-row double-counting) and gap 9 (stale `sync-pipeline.md` doc drift) are NOT addressed by this plan — they were explicitly out of scope for 07-06 (Tasks 1/2a/2b/3 only); a follow-on gap-closure plan should pick those up before the dashboard is declared fully honest.
- No blockers.

---
*Phase: 07-executive-sales-pipeline-dashboard*
*Completed: 2026-07-02*

## Self-Check: PASSED

All 6 claimed artifact files found on disk; all 4 task commits (49dca39, 765b4bf, 67f7157, 21ce4a6) found in git log.
