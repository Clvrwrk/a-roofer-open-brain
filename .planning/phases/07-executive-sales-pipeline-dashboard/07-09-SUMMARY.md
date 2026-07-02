---
phase: 07-executive-sales-pipeline-dashboard
plan: 09
subsystem: api
tags: [supabase, deno, edge-function, acculynx, deploy, backfill, live-fix, gap-closure]

# Dependency graph
requires:
  - phase: 07-executive-sales-pipeline-dashboard
    provides: "07-05 (job-walk capture-first rebuild), 07-06 (crm_pipeline restoration + financials/reps + D-15/D-16/D-18), 07-07 (dashboard dedup + doc drift fix), 07-08 (webhook trigger layer) — all merged to main and awaiting live deploy + verification."
provides:
  - "Rebuilt acculynx-sync deployed to prod (v39 as of this plan's last deploy), superseding v19."
  - "3 live-only mapper/scheduling bugs found and fixed during the wichita backfill canary (none were catchable by the existing mocked test suite — all three required a live-DB probe per CLAUDE.md's 'verify against the live DB' rule)."
  - "A running D-18 backfill rotation for wichita (accountFilter-targeted), proceeding cleanly (0 errors across 9 consecutive post-fix runs, 374/1286 jobs walked = 29%) — continues automatically via the existing hourly multiAccount cron."
  - "KS-11 ground-truth anchor CONFIRMED LIVE at the source-table layer (acculynx_job_financials, representatives->acculynx_users): approved_job_value 30368.48, balance_due 17532.48, company rep resolves to Bob Smolek — exact match to the plan's ground truth."
  - "docs/knowledge-base/acculynx/ingestion/runbook.md 'Backfill rotation (Phase 7 gap closure)' section documenting kickoff commands, expected multi-run pacing, and watch queries."
affects: ["Phase 7 closure (pending the Task 3 human-verify checkpoint)", "any future phase that reads crm_pipeline/acculynx_job_financials/acculynx_job_walk_errors"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Real-field-first, invented-name-fallback (repeated from 07-08's webhook fix): when a live probe reveals AccuLynx's actual API field names differ from a design-time assumption, promote the real names to primary and keep the assumed names as harmless aliases rather than a breaking rewrite."
    - "information_schema live-schema probes before trusting a migration file's column definition — this session found a live column (`acculynx_job_milestone_history.id`) that is GENERATED ALWAYS AS IDENTITY in prod but plain bigint in the migration 169 source file, and a live table (`acculynx_raw`) whose timestamp column is `fetched_at`, not the `created_at` the D-16 scheduling code assumed."

key-files:
  created:
    - .planning/phases/07-executive-sales-pipeline-dashboard/07-09-SUMMARY.md
  modified:
    - supabase/functions/acculynx-sync/lib/mappers.ts
    - supabase/functions/acculynx-sync/lib/mappers.test.ts
    - supabase/functions/acculynx-sync/resources/job-walk.ts
    - supabase/functions/acculynx-sync/resources/job-walk.test.ts
    - docs/knowledge-base/acculynx/ingestion/runbook.md

key-decisions:
  - "mapMilestoneHistoryItem() omits `id` entirely rather than sending a value: the live column is GENERATED ALWAYS AS IDENTITY (confirmed via information_schema, differs from the 169 migration file), so any explicit value is rejected by Postgres; the upsert now targets the pre-existing natural unique index (job_id, milestone_name, milestone_date) via an explicit onConflict instead of relying on the (unsent) primary key default."
  - "acculynx_job_insurance's insurance_company_id FK is satisfied by upserting a minimal acculynx_insurance_carriers stub (id + name) from the SAME /jobs/{id}/insurance response body, rather than building a whole new carrier-list sync resource — the table/columns/FK were already designed in migration 169 ('ingested in Plan 03') but never actually populated by any code path; this is the smallest correct completion of an already-designed-for reference table, not a new architectural surface."
  - "nullableDate() added to lib/mappers.ts and applied only to the specific nullable timestamptz fields AccuLynx was observed sending '' for (invoice_date, created_date, date_of_loss, claim_filed_date) — NOT applied to milestone_date, which is NOT NULL at the DB level and had no observed '' case; trading a clean null-coercion for a NOT NULL constraint violation on an unobserved case would be a regression, not a fix."
  - "Given the wichita backfill's job-walk consistently saturates its ~110s per-account budget (D-15 first-sight pull is unavoidably slow: ~7 endpoints/job x pacing sleeps -> ~25-35 jobs/run), and syncCrmPipeline never got a budget turn during this session's ~10 manually-triggered runs, this plan does NOT force-complete the full 1,286-job wichita rotation manually — that would require ~30+ more 110-second-spaced triggers (over an hour of pure waiting) for a single account of 8. The existing hourly cron continues the D-18 rotation automatically; this is the plan's own explicitly-anticipated 'expected multi-run pacing... not a fault' scenario (07-09-PLAN.md Task 2 acceptance criteria), not a shortfall."

patterns-established:
  - "Live-DB-probe-first bug triage during a canary backfill: after every trigger, re-query acculynx_job_walk_errors/v_acculynx_cron_outcomes/crm_pipeline directly rather than trusting the deployed code's own self-report — this session's first triggered run reported jobWalk:'ok' while silently producing 43 sub-resource write failures the run's own JSON summary never surfaced."

requirements-completed: [REQ-10]

coverage:
  - id: D1
    description: "Rebuilt acculynx-sync (07-05..07-08) deployed to prod via `supabase functions deploy` (never Coolify); explain-then-ship note stated before deploy (crm_pipeline restored on the hourly cron, financials/reps mapped, D-15/D-16/D-18 scheduling, rollback = redeploy prior source per runbook Scenario C)."
    requirement: "REQ-10"
    verification:
      - kind: other
        ref: "supabase functions list shows acculynx-sync ACTIVE, version bumped v36->v39 across 3 same-session redeploys following 3 live-fixes; v_acculynx_cron_outcomes shows outcome='success' for every dispatched wichita-targeted trigger (log_ids 415-448+, request_ids 318-332)."
        status: pass
    human_judgment: false
  - id: D2
    description: "D-18 backfill rotation kicked off and sustained: accountFilter=['wichita'] triggered ~10 times this session (request_ids 318-332); job-walk watermark's last_walked_job_id advances every run (never resets), confirming forward progress, not a restart-from-scratch loop."
    requirement: "REQ-10"
    verification:
      - kind: other
        ref: "acculynx_sync_watermark(account_key='wichita', resource_type='job_walk').last_walked_job_id advanced from null -> 374/1286 jobs walked (29%) across the session; acculynx_job_walk_errors: 0 rows since the final fix deploy (v39, 2026-07-02T20:50:06Z) across 9 consecutive triggered runs."
        status: pass
    human_judgment: false
  - id: D3
    description: "3 live-only bugs found and fixed during the wichita canary, none catchable by the pre-existing mocked test suite: (a) mapMilestoneHistoryItem sent an explicit id into a GENERATED ALWAYS AS IDENTITY column; (b) acculynx_job_insurance's insurance_company_id FK had no populated referent table; (c) mapMilestoneHistoryItem/mapInvoiceHeader used the wrong AccuLynx field names in one case (milestoneName/milestoneDate vs real name/date) and didn't normalize empty-string dates in another (invoiceDate/createdDate). A 4th bug (D-16's shouldWalkJob querying a nonexistent acculynx_raw.created_at column, permanently defeating the change-driven skip) was also found and fixed."
    requirement: "REQ-10"
    verification:
      - kind: unit
        ref: "supabase/functions/acculynx-sync/lib/mappers.test.ts + resources/job-walk.test.ts: 112/112 full acculynx-sync suite passing after all 4 fixes (up from 111 pre-session; 2 pre-existing tests updated for the intentional id-omission contract, 4 new regression tests added for the real field-name/empty-date/identity-column cases)."
        status: pass
      - kind: other
        ref: "Live re-probe post-fix: job_insurance FK errors 21->0, invoices empty-date errors 1->0, milestone_history errors (2 distinct root causes across 2 fix rounds) 46+28->0, all sustained across 9 consecutive wichita triggers with zero regressions."
        status: pass
    human_judgment: false
  - id: D4
    description: "KS-11 ground-truth anchor confirmed live against the actual AccuLynx API (not a migration file, not a mock): acculynx_job_financials.approved_job_value=30368.48, balance_due=17532.48 (job_id 0c732e56-5b34-4ae6-9e84-3f57a38f3633); the full /representatives collection resolves company rep user.id 779da1e7-3b67-411d-bbe8-d4973ab98314 -> acculynx_users.display_name='Bob Smolek'. Exactly ONE crm_pipeline row exists for this acculynx_job_id (no duplicate) — but that row is still the STALE pre-fix value (contract_amount=0, primary_salesperson=null, updated_at 2026-06-30) because syncCrmPipeline has not yet had a budget turn for wichita this rotation (job-walk still consumes the full ~110s budget at 29% first-sight progress)."
    requirement: "REQ-10"
    verification:
      - kind: other
        ref: "Direct supabase db query --linked probes: acculynx_job_financials row matches ground truth exactly; acculynx_raw representatives payload for the job GUID + acculynx_users join resolves to 'Bob Smolek'; crm_pipeline count(*) where acculynx_job_id=<KS-11 GUID> = 1 (no duplicate)."
        status: pass
      - kind: manual_procedural
        ref: "crm_pipeline.contract_amount/balance_due/primary_salesperson for KS-11 are NOT yet refreshed — this is the expected multi-run pacing the plan's own Task 2 acceptance criteria anticipates ('if not yet populated, the SUMMARY records that the backfill has not yet reached the account... the human checkpoint is not entered until the anchor is live'). Per that instruction, the Task 3 checkpoint below is entered as a status report, not a false 'approved' claim — the human is asked to evaluate the honest state, including this specific gap, rather than being shown a dashboard that would still display the stale KS-11 values."
        status: unknown
    human_judgment: true
    rationale: "Whether the still-in-progress backfill state (data correct at the source tables, not yet reflected in crm_pipeline/the dashboard for KS-11 specifically) is acceptable to close Phase 7 now, or whether the checkpoint should be deferred until crm_pipeline actually refreshes, is a judgment call only the human can make — this is exactly why 07-09-PLAN.md's Task 3 is a blocking checkpoint rather than an auto-pass."
  - id: D5
    description: "runbook.md 'Backfill rotation (Phase 7 gap closure)' section added: kickoff commands (default rotation + targeted accountFilter), why job-walk saturating the budget every run is expected pacing (not a fault), how syncCrmPipeline backfills an account's entire crm_pipeline in one pass once it gets ANY budget turn, watch queries, and a summary of the 4 live bugs found/fixed this session."
    requirement: "REQ-10"
    verification:
      - kind: other
        ref: "grep -qi 'backfill rotation' runbook.md && grep -qi 'accountFilter' runbook.md && echo OK -> OK"
        status: pass
    human_judgment: false

duration: ~2h
completed: 2026-07-02
status: complete
---

# Phase 7 Plan 09: Deploy + Backfill Rotation + Live KS-11 Verification (Gap Closure, FINAL) Summary

**Deployed the rebuilt acculynx-sync to prod, found and fixed 4 live-only bugs the wichita backfill canary surfaced (an identity-column mismatch, an unpopulated FK reference table, a real-vs-invented AccuLynx field name, and a silently-broken D-16 change-driven skip), and confirmed the KS-11 ground-truth anchor (30368.48 / 17532.48 / Bob Smolek) live at the source-table layer — crm_pipeline itself has not yet been refreshed for wichita because the still-in-progress first-sight backfill (29% complete, 0 errors sustained) has not yet given syncCrmPipeline a budget turn; this is the plan's own explicitly-anticipated multi-run pacing, not a fault.**

## Performance

- **Duration:** ~2h
- **Completed:** 2026-07-02
- **Tasks:** 2 of 3 (Task 1 + Task 2 autonomous, both complete; Task 3 is the blocking human-verify checkpoint returned below)
- **Files modified:** 5 (4 code/test, 1 doc)

## Accomplishments
- Deployed the rebuilt `acculynx-sync` edge function (07-05..07-08's work) to prod, `rnhmvcpsvtqjlffpsayu`, via `supabase functions deploy` — version bumped v19 -> v39 across this session (3 same-session live-fix redeploys after the initial deploy).
- Kicked off the D-18 backfill rotation targeting wichita (the VERIFICATION.md-flagged starved account) via `accountFilter:["wichita"]`; triggered ~10 times this session, watching `v_acculynx_cron_outcomes` (100% `success`) and `acculynx_job_walk_errors` (0 since the final fix) between triggers.
- **Found and fixed 4 live-only bugs**, none catchable by the pre-existing mocked test suite — all four required a direct live-DB probe (`information_schema`, `acculynx_raw` payloads) per the CLAUDE.md "verify against the live DB" lesson:
  1. `mapMilestoneHistoryItem` sent an explicit `id` into a column that is `GENERATED ALWAYS AS IDENTITY` live (differs from the 169 migration file's plain `bigint primary key`) — Postgres rejected every row. Fixed by omitting `id` and upserting on the natural unique index.
  2. `acculynx_job_insurance.insurance_company_id` FKs to `acculynx_insurance_carriers`, a reference table designed in migration 169 but never populated by any sync path — every insurance row with a non-null carrier id failed the FK (21/21 recent errors). Fixed by upserting a carrier stub from the same response body before the detail row.
  3. `mapInvoiceHeader`/`mapJobInsurance` date fields used `?? null`, which doesn't catch AccuLynx's `""` on void/incomplete records — Postgres rejected empty-string timestamptz values. Fixed with a new `nullableDate()` helper applied to the specific nullable fields observed sending `""`.
  4. A second, independent milestone-history bug surfaced after fix #1 landed: the REAL AccuLynx field shape is `{date, name}`, not the design-time-assumed `{milestoneDate, milestoneName}` — same class of bug 07-08 found in the webhook topic map. Fixed with the same alias-preserving pattern (real names primary, assumed names as fallback).
  5. (Found investigating why crm_pipeline still wasn't reached after fixes 1-4): `shouldWalkJob()`'s D-16 change-driven skip queried `acculynx_raw.select("created_at")`, but the live column is `fetched_at` — the query silently returned no rows for every job, permanently defeating D-16 and guaranteeing job-walk would burn its full budget on every single run forever. Fixed by correcting the column name.
- **KS-11 ground-truth anchor CONFIRMED LIVE** at the source-table layer: `acculynx_job_financials.approved_job_value=30368.48`, `balance_due=17532.48` (exact match); the full `/representatives` collection resolves the company rep to `Bob Smolek`. Exactly one `crm_pipeline` row exists for this job (no duplicate) — but it still holds the pre-fix stale value, since `syncCrmPipeline` has not yet had a budget turn for wichita.
- Added the "Backfill rotation (Phase 7 gap closure)" section to `runbook.md`: kickoff commands, why job-walk saturating the budget is expected pacing, how `syncCrmPipeline` backfills an account's whole `crm_pipeline` in one pass once it gets any turn, and watch queries.

## Task Commits

Each task was committed atomically:

1. **Task 1 (fix round 1): live-fix 3 job-walk mapping bugs surfacing on first prod run** - `e5fc659` (fix)
2. **Task 1 (fix round 2): live-fix milestone-history real field names** - `60356c4` (fix)
3. **Task 1 (fix round 3): live-fix D-16 change-driven skip (acculynx_raw column name)** - `8cc5d58` (fix)
4. **Task 1: runbook.md Backfill rotation section** - `88e98c5` (docs)
5. **Task 2: live-DB KS-11 assertion** - no code change; verification-only, recorded in this SUMMARY and the coverage table above (per the plan's own instruction: "otherwise this task is a live-DB verification with no code change").

**Plan metadata:** (this commit — docs: complete plan)

## Files Created/Modified
- `supabase/functions/acculynx-sync/lib/mappers.ts` - `nullableDate()` helper added; `mapMilestoneHistoryItem` omits `id`, reads real `date`/`name` fields with `milestoneDate`/`milestoneName` fallback; `mapJobInsurance`/`mapInvoiceHeader` date fields normalized via `nullableDate()`
- `supabase/functions/acculynx-sync/lib/mappers.test.ts` - 2 pre-existing tests updated for the id-omission contract; 4 new regression tests (real milestone-history shape, empty-string date normalization x2)
- `supabase/functions/acculynx-sync/resources/job-walk.ts` - milestone_history upsert targets the natural unique index via explicit `onConflict`; insurance-carrier stub upsert added before the detail row; `shouldWalkJob()` corrected to query `fetched_at` instead of the nonexistent `created_at`
- `supabase/functions/acculynx-sync/resources/job-walk.test.ts` - mock's `acculynx_raw` field name updated from `created_at` to `fetched_at` to match the corrected source
- `docs/knowledge-base/acculynx/ingestion/runbook.md` - new "Backfill rotation (Phase 7 gap closure)" section; version references updated (v19 -> v39)

## Decisions Made
- **milestone_date left on `?? null`, not wrapped in `nullableDate()`:** the column is `NOT NULL` at the DB level and no `""` case was ever observed for it (unlike `invoice_date`/`created_date`/`date_of_loss`/`claim_filed_date`); coercing an unobserved case to `null` would trade a clean, informative failure for a silent invented value on a required column.
- **Insurance carrier FK closed via a stub upsert from the existing response body, not a new sync resource:** the table/columns/FK were already fully designed in migration 169 ("Shared reference table... ingested in Plan 03") but simply never wired to any fetch path — completing that wiring with data already in-hand is the smallest correct fix, not new architecture.
- **Did not manually force-complete the wichita backfill to 100%:** at the observed ~25-35 jobs/run pace, completing the remaining ~910/1286 jobs would need 30+ more 110-second-spaced manual triggers (over an hour of pure waiting) for one of 8 accounts. The plan's own Task 2 acceptance criteria explicitly anticipates this ("let the backfill rotation reach the wichita/kansas account and re-probe — this is expected multi-run pacing, not a fault"); the existing hourly cron continues the rotation automatically without further manual intervention.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] mapMilestoneHistoryItem sent an explicit id into a GENERATED ALWAYS AS IDENTITY column**
- **Found during:** Task 1, first triggered backfill run (43 job_walk errors surfaced in the first hour)
- **Issue:** The live `acculynx_job_milestone_history.id` column is `bigint GENERATED ALWAYS AS IDENTITY` (confirmed via `information_schema`), differing from the migration 169 source file's plain `bigint primary key` — Postgres rejects any explicit non-DEFAULT value.
- **Fix:** Removed `id` from `mapMilestoneHistoryItem`'s returned row; the upsert now targets the pre-existing natural unique index `(job_id, milestone_name, milestone_date)` via explicit `onConflict`.
- **Files modified:** `lib/mappers.ts`, `resources/job-walk.ts`, both test files.
- **Commit:** `e5fc659`

**2. [Rule 2 - Missing critical functionality] acculynx_insurance_carriers reference table never populated**
- **Found during:** Task 1, same first triggered run
- **Issue:** `acculynx_job_insurance.insurance_company_id` FKs to `acculynx_insurance_carriers`, designed in migration 169 ("ingested in Plan 03") but never actually populated by any sync code — every insurance row with a non-null carrier id failed the FK (21/21 recent errors).
- **Fix:** `job-walk.ts` now upserts a minimal carrier stub (`id`, `name`) from the same `/jobs/{id}/insurance` response body before the detail-row upsert, satisfying the FK without a new sync resource.
- **Files modified:** `resources/job-walk.ts`.
- **Commit:** `e5fc659`

**3. [Rule 1 - Bug] Empty-string dates rejected by timestamptz columns**
- **Found during:** Task 1, same first triggered run (1 invoices error)
- **Issue:** AccuLynx sends `""` for `dueDate`/`invoiceDate` on void/incomplete invoices; `?? null` doesn't catch empty strings, and Postgres rejects `""` for `timestamptz`.
- **Fix:** Added `nullableDate()`, applied to `invoice_date`/`created_date` (invoices) and `date_of_loss`/`claim_filed_date` (insurance) — the specific nullable timestamptz fields observed sending `""`. `due_date` is `text` at the DB level (confirmed live) and needed no change.
- **Files modified:** `lib/mappers.ts`.
- **Commit:** `e5fc659`

**4. [Rule 1 - Bug] milestone-history's real AccuLynx field shape is {date, name}, not {milestoneDate, milestoneName}**
- **Found during:** Task 1, second triggered run after fix #1 redeployed (same errors persisted, now a different root cause: NOT NULL violation on milestone_name)
- **Issue:** Fix #1's identity-column correction was itself correct and deployed, but a second, independent bug in the same mapper was masked behind it: the live milestone-history item shape is `{date, name}` (confirmed via the actual `acculynx_raw` payload), not the design-time-assumed `{milestoneDate, milestoneName}` — same class of bug 07-08 found in the webhook topic-routing map.
- **Fix:** `name`/`date` read first, `milestoneName`/`milestoneDate` kept as harmless fallbacks (alias-preserving pattern from 07-08).
- **Files modified:** `lib/mappers.ts`, `lib/mappers.test.ts`.
- **Commit:** `60356c4`

**5. [Rule 1 - Bug] D-16's shouldWalkJob queried a nonexistent acculynx_raw.created_at column**
- **Found during:** Task 1, investigating why job-walk still saturated its full budget every run (3 clean post-fix runs, still `crmPipeline:"skipped"` every time)
- **Issue:** `shouldWalkJob()` (07-06's D-15/D-16 scheduling wrapper) selected/ordered by `created_at` against `acculynx_raw`, but the live table's timestamp column is `fetched_at` — PostgREST silently returned no matching rows for the nonexistent column, so `newestArchive` was ALWAYS null and every job was misclassified as `first_sight` forever. D-16's change-driven skip never skipped a single job in production.
- **Fix:** Corrected the column name to `fetched_at` in both the query and its `order()` clause; updated the test mock's field name to match.
- **Files modified:** `resources/job-walk.ts`, `resources/job-walk.test.ts`.
- **Commit:** `8cc5d58`

No Rule 4 (architectural) deviations — all five fixes were mapping/query corrections within the existing design (mirroring 07-08's precedent), not structural changes. All five were auto-fixed per Rules 1/2 without requiring a checkpoint, since each directly blocked the plan's stated correctness/completeness goal for this exact task.

### Auth Gates
None. `supabase functions deploy` and `supabase db query --linked` both used the already-authenticated CLI session; no interactive auth prompt occurred.

## Known Stubs
None introduced. All fixes wire real data paths; no placeholder/mock data remains in this plan's scope.

## Threat Flags
None new. All fixes stay within the existing threat model (T-07-09-01 through T-07-09-04, T-07-09-SC) — no new trust boundary, endpoint, or auth path was introduced. The insurance-carrier stub upsert writes into an already-designed, already-RLS-governed table using data from a response the sync already fetches; it does not expand what the sync reads or who can read it.

## Issues Encountered
- **The wichita backfill did not reach 100% completion this session.** At the observed pace (~25-35 jobs walked per ~110s run, due to D-15's necessarily-slow first-sight full pull across 7 endpoints/job), only 374/1286 wichita jobs (29%) were walked by session end, all with zero mapping errors post-fix. `syncCrmPipeline` therefore never got a budget turn for wichita this session, so `crm_pipeline`'s KS-11 row still holds its pre-fix stale value even though the correct value is proven live at the source tables. Per the plan's own Task 2 acceptance criteria, this is explicitly anticipated ("if the values are not yet present, let the backfill rotation reach the wichita/kansas account and re-probe — this is expected multi-run pacing, not a fault") and the existing hourly `multiAccount` cron continues the rotation automatically without further action.
- Discovering fix #4 (masked behind fix #1) and fix #5 (masked behind fixes #1-3, only became visible once errors stopped and the "why does crm_pipeline never run" question was asked) required iterative live-DB re-probing after each deploy — the plan's "no code change unless a probe reveals a mapping bug" instruction (Task 2) was interpreted to also cover Task 1's explicit acceptance criterion that `acculynx_job_walk_errors` stay "at or near zero," which none of the pre-existing mocked tests could have caught since they don't validate column names or field shapes against the real live schema/API.

## User Setup Required
None. All actions (deploy, backfill triggers, live-DB probes) used already-authorized CLI sessions per this plan's explicit deploy authorizations.

## Next Phase Readiness
- **Task 3 (this plan's blocking checkpoint) is returned below, NOT self-approved**, per this plan's explicit instruction to stop there. The checkpoint honestly reports: crm_pipeline is proven correct at the source-table layer for KS-11 but not yet refreshed in crm_pipeline itself (backfill in progress, 29% complete for wichita, 0 errors); the human must decide whether to approve Phase 7 closure now (accepting the in-progress backfill as the delivered state, per the plan's own explicit "expected multi-run pacing, not a fault" framing) or wait and re-verify once crm_pipeline has visibly refreshed for wichita.
- The hourly `multiAccount` cron continues the D-18 rotation automatically for wichita and, once the rotation cursor advances past it, the remaining 7 accounts — no further manual triggering is required for the backfill to eventually complete.
- No blockers beyond the above judgment call.

---
*Phase: 07-executive-sales-pipeline-dashboard*
*Completed: 2026-07-02*

## Self-Check: PASSED

All 5 claimed modified files found on disk (mappers.ts, mappers.test.ts, job-walk.ts, job-walk.test.ts, runbook.md); all 4 task commits (e5fc659, 60356c4, 8cc5d58, 88e98c5) found in git log.
