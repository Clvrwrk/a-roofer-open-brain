---
phase: 07-executive-sales-pipeline-dashboard
verified: 2026-07-02T12:00:00Z
status: gaps_found
score: 5/9 must-haves verified
behavior_unverified: 0
overrides_applied: 0
gaps:
  - truth: "The dashboard reflects all 8 location accounts (filterable by location/market) and updates within the hourly freshness SLA (ROADMAP SC3)."
    status: failed
    reason: "crm_pipeline (the dashboard's sole data source table) is FROZEN. The Phase 3 multiAccount hourly path (runAccountSync, index.ts:537) calls only syncJobs/syncContacts/syncEstimates/syncJobWalk — it never upserts crm_pipeline. The only crm_pipeline upsert (index.ts:454-458) lives inside legacySyncJobs, which is gated `if (!multiAccount)` (index.ts:741) and therefore does not run on the hourly cron. No crm_pipeline write has occurred since the cutover to multiAccount (last api_sync write observed 2026-07-02T08:15 per live investigation). Colorado alone has 1,843 acculynx_jobs rows and zero crm_pipeline counterparts. The dashboard is reading a table the current ingestion pipeline no longer feeds."
    artifacts:
      - path: "supabase/functions/acculynx-sync/index.ts"
        issue: "crm_pipeline upsert (lines 454-458) is unreachable from the multiAccount=true hourly cron path; runAccountSync (line 537) has no crm_pipeline write at all"
    missing:
      - "Add a crm_pipeline upsert/mapping step to runAccountSync (or a new resource module called from it) so the hourly multiAccount path keeps crm_pipeline current for all 8 accounts, not just the retired single-account legacy path."
  - truth: "Every currently-unfed job sub-resource populates correctly (job_contacts, job_financials, job_insurance, milestone_history, invoices, invoice_lines) so downstream margin/financial KPIs are honest."
    status: failed
    reason: "job-walk.ts spreads raw camelCase AccuLynx API response bodies directly into snake_case Postgres tables (`{...c, job_id, account_key, ...}` at line ~110; `{...(financialsBody as Record<string,unknown>), ...}` at line ~130, and equivalently for insurance/invoice_lines). PostgREST rejects unknown/mismatched-case columns, so these upserts fail for effectively 100% of rows. The failure is caught and only `console.warn`'d (job-walk.ts multiple sites, e.g. line 119: `if (error) console.warn(...)`) — the walk's outer result still reports success/'ok', so nothing downstream (including check_acculynx_alerts()) ever sees these as errors. This is a silent-failure design flaw, not an intermittent bug."
    artifacts:
      - path: "supabase/functions/acculynx-sync/resources/job-walk.ts"
        issue: "Lines ~108-119 (job_contacts), ~124-140 (job_financials), ~142-155 (insurance), and the invoice_lines block spread raw API camelCase bodies into snake_case tables with console.warn-only error handling; no explicit field mapping exists"
    missing:
      - "Add explicit snake_case field maps in job-walk.ts for each of job_contacts / job_financials / job_insurance / invoice_lines (and milestone_history, invoices) instead of spreading the raw API body."
      - "Promote job-walk upsert failures from console.warn to a counted/queryable error surface (e.g. an error-count column or a dedicated table) that check_acculynx_alerts() can see — currently these failures are invisible to all four D-05 alert conditions in 176-acculynx-alert-check-fn.sql."
  - truth: "Margin/financial KPIs (contract_amount, balance_due) are populated from the API even though the mirror lacks them — job KS-11 proves the API HAS this data (approvedJobValue 30368.48, balanceDue 17532.48) that the sync never captures."
    status: failed
    reason: "grep across supabase/functions/acculynx-sync/ shows zero writes to crm_pipeline.contract_amount or crm_pipeline.balance_due from job financials — these columns have never been populated (0 rows > 0 in the whole table, per live investigation). The /jobs/{id}/financials endpoint IS fetched by job-walk.ts and written to acculynx_job_financials, but (a) that upsert fails per the gap above, and (b) even if it succeeded, no code maps financials -> crm_pipeline.contract_amount/balance_due. Representatives are also incomplete: only /jobs/{id}/representatives/sales-owner is fetched (index.ts:211, inside the legacy resolveLeadMilestones helper); the full /representatives list (which carries the company rep, proven present via GET on job KS-11) is never fetched by any sync path."
    artifacts:
      - path: "supabase/functions/acculynx-sync/index.ts"
        issue: "resolveLeadMilestones (line ~183) only calls GET /jobs/{id}/representatives/sales-owner, never the full /representatives collection"
      - path: "supabase/functions/acculynx-sync/resources/job-walk.ts"
        issue: "No mapping step writes financials data forward into crm_pipeline.contract_amount/balance_due"
    missing:
      - "Add financials -> crm_pipeline.contract_amount/balance_due mapping in the multiAccount path (after fixing the job-walk field-mapping gap above)."
      - "Fetch the full /jobs/{id}/representatives collection (not just sales-owner) and map the company/primary rep -> crm_pipeline.primary_salesperson where sales-owner is empty (204) — this is the wichita/kansas_city gap the live KS-11 test proved."
  - truth: "The sync fans out across all 8 production keys without starving any single account of its budget (ROADMAP Phase 2 SC1, carried as a Phase 7 completeness precondition)."
    status: failed
    reason: "The serial per-account loop (index.ts:711-724) walks accounts in registry order within one shared ~110s runtime budget when accountFilter is absent. Live investigation shows wichita's job_walk watermark stuck at 2025-09-16 (1242/1286 processed) because colorado (a larger account) consumes the full budget most runs before wichita's turn — and because the job-walk watermark update is a raw `.update()` matched by (account_key, resource_type) (job-walk.ts line ~240-247) rather than the shared advanceWatermark() upsert helper (lib/watermark.ts), so on a fresh/never-seeded (account_key,'job_walk') pair the UPDATE matches zero rows and silently no-ops — the walk restarts from scratch every run for any account whose job_walk watermark row was never seeded."
    artifacts:
      - path: "supabase/functions/acculynx-sync/resources/job-walk.ts"
        issue: "Inline watermark advance (~line 240) uses .update().eq(account_key).eq(resource_type) instead of the upsert-based advanceWatermark() helper already defined in lib/watermark.ts — silently no-ops when no seed row exists"
      - path: "supabase/functions/acculynx-sync/index.ts"
        issue: "Serial account loop (lines 711-724) has no per-account budget rotation/fair-share; the accountFilter mechanism exists (comment at line ~702-704 references a wichita budget-exhaustion fix) but is not the default no-arg behavior, so colorado can still exhaust the shared 110s budget before smaller accounts run"
    missing:
      - "Seed job_walk watermark rows for every (account_key,'job_walk') pair via a one-time backfill INSERT, or switch job-walk.ts's inline update to the shared advanceWatermark() upsert helper."
      - "Add budget rotation across accounts (round-robin or per-account time-slicing) so no single account (colorado) can consume the entire shared runtime budget every run at another account's (wichita's) expense — or schedule per-account cron invocations using accountFilter by default."
  - truth: "crm_pipeline rows are free of unmergeable duplicates so pipeline value / funnel counts are not double-counted (data-integrity precondition for SC2/SC3's dashboard honesty)."
    status: failed
    reason: "5,578 csv_initial crm_pipeline rows lack acculynx_job_id and can never merge with their api_sync twin via the join key the loader relies on. Live investigation found job KS-11 exists twice in crm_pipeline: a $0/unassigned api_sync row and a stale-valued csv_initial row. The dashboard loader (app/command-center/src/lib/executive-pipeline.ts) selects `data_source` in its crm_pipeline query (line 1141/1455) but a grep of the file for any use of `.data_source` beyond the select-list returns zero hits — no dedup, no data_source-based filtering, no precedence rule exists anywhere in the loader. Every KPI (funnel counts, pipeline value, close rate) computed over crm_pipeline is therefore exposed to duplicate-row double-counting for any job that exists in both a csv_initial and an api_sync row."
    artifacts:
      - path: "app/command-center/src/lib/executive-pipeline.ts"
        issue: "data_source is fetched (line 1141) but never referenced again in the file — no dedup/precedence logic between csv_initial and api_sync rows for the same underlying job"
    missing:
      - "Define and implement a csv/api row dedup strategy in the loader (or upstream in the sync function): e.g. prefer api_sync when acculynx_job_id is present on both, or backfill acculynx_job_id onto the 5,578 orphaned csv_initial rows so they merge naturally, then filter/collapse duplicates in loadExecutivePipelineDashboard before aggregation."
missing_direct:
  - truth: "docs/knowledge-base/acculynx/ingestion/sync-pipeline.md accurately describes the live ingestion path."
    status: failed
    reason: "sync-pipeline.md (lines 21, 42) still states the pipeline 'upsert acculynx_jobs + crm_pipeline (+ contacts/estimates/... per resource)' and cites crm_pipeline normalization with data_source='api_sync' as the live behavior. This is doc drift: that description matches only the retired legacySyncJobs path, not the current multiAccount hourly cron, which never touches crm_pipeline (see the first gap above)."
    artifacts:
      - path: "docs/knowledge-base/acculynx/ingestion/sync-pipeline.md"
        issue: "Lines 21 and 42 claim the live/multiAccount sync path upserts crm_pipeline; it does not"
    missing:
      - "Correct sync-pipeline.md to state that crm_pipeline is currently NOT written by the hourly multiAccount cron and is stale/frozen since the Phase 3 cutover, until the gap-closure fix lands."
human_verification:
  - test: "Re-run the Task 3 human-verify checkpoint in 07-04-PLAN.md against the live dashboard after the crm_pipeline/job-walk/watermark/dedup gaps are closed."
    expected: "All 8 locations show current (within-hourly-SLA) data; freshness badges are honest; margin/coverage captions reflect real, growing coverage; no job appears twice with conflicting values."
    why_human: "Visual/data-quality judgment on the live production dashboard; this is exactly the checkpoint that already surfaced the gap and must be re-run, not re-asserted, once the fix lands."
---

# Phase 7: Executive Sales Pipeline Dashboard Verification Report

**Phase Goal:** A realtime, executive-grade sales pipeline dashboard under the Executive tab proves the full multi-location data is present and replaces the weekly snapshot.
**Verified:** 2026-07-02
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

Must-haves are the ROADMAP Phase 7 Success Criteria (SC1-SC4) plus the phase's data-integrity preconditions surfaced by a live-DB + live-API investigation on 2026-07-02 (post-implementation, post-checkpoint). SUMMARY.md claims of "complete"/"live"/"pass" are NOT accepted as evidence per the goal-backward mandate — every truth below is checked against the actual codebase and, where the task specifies, cross-referenced against live findings the prompt supplied as evidence.

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1 — C-suite dashboard best practices researched and distilled into a spec | VERIFIED | `.planning/phases/07-executive-sales-pipeline-dashboard/07-RESEARCH.md` and `07-UI-SPEC.md` exist with KPI/architecture research; `docs/knowledge-base/acculynx/dashboard-spec.md` (18.6KB, committed at `4231550`) documents the AS-BUILT KPI set, join map, margin contract, chart pick, and freshness architecture, and is linked from `docs/knowledge-base/acculynx/index.md`. |
| 2 | SC2 — A realtime dashboard exists under the Executive tab, replacing the weekly snapshot, with the researched KPIs and interactivity | VERIFIED (surface only — see truth 3 for the data-honesty half) | `app/command-center/src/pages/executive/pipeline.astro`, `src/pages/api/executive/pipeline.json.ts`, `src/scripts/executive-pipeline.ts` exist and are wired (SSR loader import confirmed, `/api/executive/pipeline.json` fetch + `setInterval` confirmed in the client script). The weekly snapshot's 7 files + `[slug].astro` stub are deleted (`git log` / 07-03 self-check); `nav.ts`/`healthz.ts`/`sw.js.ts`/`AppShell.astro` all rewired to `/executive/pipeline`. The Task 3 checkpoint in 07-02-PLAN.md (UX/layout) was approved after 4 rework rounds. The Task 3 checkpoint in 07-04-PLAN.md (live-data honesty) is the one that FAILED — see truth 3. |
| 3 | SC3 — The dashboard reflects all 8 location accounts (filterable) and updates within the hourly freshness SLA | FAILED | `crm_pipeline`, the dashboard's sole source table (`app/command-center/src/lib/executive-pipeline.ts:1140`), is not written by the hourly `multiAccount:true` cron path at all. `runAccountSync` (supabase/functions/acculynx-sync/index.ts:537-634) calls only `syncJobs`/`syncContacts`/`syncEstimates`/`syncJobWalk`; the only `crm_pipeline` upsert in the file (lines 454-458) sits inside `legacySyncJobs`, itself gated `if (!multiAccount)` at line 741. Confirmed by direct source read, not by SUMMARY claim. Colorado: 1,843 `acculynx_jobs` rows vs. zero `crm_pipeline` counterparts (live-DB finding supplied with this verification task). The dashboard's freshness badges (D-12) read `acculynx_sync_watermark`/`v_acculynx_cron_outcomes`, which DO update hourly for jobs/contacts/estimates — so the badges can show "ready" while the KPIs computed from the frozen `crm_pipeline` table are stale/wrong. This is the exact failure mode the phase goal ("proves the full multi-location data is present") exists to catch. |
| 4 | SC4 — Deployed and verified live (buildCommit flipped) per the deploy gate | VERIFIED | `07-04-SUMMARY.md` records `origin/main` pushed to `4231550`; `/healthz buildCommit` polled stable across 10 consecutive checks; `/executive/pipeline` returns a WorkOS auth-redirect (live+gated); `/weekly-snapshot` confirmed retired via build-output (`dist/` has zero weekly-snapshot artifacts) + `healthz requiredRoutes` evidence (anonymous-curl 404 is architecturally indistinguishable from gated-live under this app's middleware — documented and reasonable substitution). Deploy mechanics are sound; this truth is about deployment, not data quality. |
| 5 | Every currently-unfed job sub-resource (job_contacts, job_financials, job_insurance, milestone_history, invoices, invoice_lines) populates correctly | FAILED | `job-walk.ts` spreads raw camelCase AccuLynx API bodies (`{...c, ...}`, `{...(financialsBody as Record<string,unknown>), ...}`) directly into snake_case Postgres tables. PostgREST rejects mismatched-case/unknown columns; the resulting error is `console.warn`-only (confirmed at multiple sites in job-walk.ts) and never surfaces to the walk's outer "ok" result or to any alert. |
| 6 | Margin/financial KPIs (contract_amount, balance_due) and representative data are captured from the API | FAILED | Zero writes to `crm_pipeline.contract_amount`/`balance_due` exist anywhere in `supabase/functions/acculynx-sync/`. `/jobs/{id}/representatives` is never fetched in full — only `/representatives/sales-owner` (index.ts:211, inside the legacy `resolveLeadMilestones` helper), which the live investigation showed returns 204-empty for job KS-11 while the full `/representatives` collection (proven via direct API call) carries the company rep. |
| 7 | Wichita/all 8 accounts get a fair share of sync runtime budget, not starved by a larger account | FAILED | The inline watermark advance in `job-walk.ts` (~line 240) uses `.update().eq(account_key).eq(resource_type)` instead of the shared `advanceWatermark()` upsert helper (`lib/watermark.ts`) — on a never-seeded `(account_key,'job_walk')` pair this UPDATE matches zero rows and silently no-ops, so the walk restarts from the beginning every run for that account. Combined with the serial per-account loop sharing one runtime budget (index.ts:711-724), this starves wichita behind colorado. |
| 8 | crm_pipeline rows are free of unmergeable duplicates (dashboard honesty precondition) | FAILED | 5,578 `csv_initial` rows lack `acculynx_job_id` and cannot merge with their `api_sync` twin. `app/command-center/src/lib/executive-pipeline.ts` selects `data_source` (line 1141) but never references it again — grep confirms zero dedup/precedence logic in the file. Every crm_pipeline-derived KPI is exposed to double-counting. |
| 9 | Ingestion documentation (sync-pipeline.md) accurately reflects the live pipeline | FAILED | `docs/knowledge-base/acculynx/ingestion/sync-pipeline.md` (lines 21, 42) still states the live path "upsert acculynx_jobs + crm_pipeline" with `data_source='api_sync'` — describing the retired `legacySyncJobs` path, not the current `multiAccount` hourly cron, which never writes `crm_pipeline` (truth 3). |

**Score:** 5/9 truths verified (0 present-but-behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `app/command-center/src/lib/executive-pipeline.ts` | Loader + pure core (funnel/close-rate/margin/region/freshness) | VERIFIED (implementation) / HOLLOW (data source) | Code is substantive, tested, and wired to the page/API route. Reads `crm_pipeline` which is frozen (see truth 3) and never dedups `data_source` (see truth 8) — the artifact is correct code over an incomplete/duplicated data source. |
| `app/command-center/src/pages/executive/pipeline.astro` | SSR page | VERIFIED | Exists, wired to `loadExecutivePipelineDashboard`, deployed live. |
| `app/command-center/src/pages/api/executive/pipeline.json.ts` | Filter-allowlisted JSON API | VERIFIED | Exists, allowlist-validates `location`/`region`/`type`/`window`, gated by existing WorkOS middleware (not added to public allowlists). |
| `app/command-center/src/scripts/executive-pipeline.ts` | Chart.js mount + filter bar + drill-down + poll | VERIFIED | `Chart.register`, `/api/executive/pipeline.json` fetch, and `setInterval` all present; build green. |
| `docs/knowledge-base/acculynx/dashboard-spec.md` | OKF dashboard spec | VERIFIED | Exists, linked from index.md, documents account_key join + coverage contract. |
| `docs/knowledge-base/acculynx/ingestion/sync-pipeline.md` | Accurate description of the live ingestion path | STALE (doc drift) | Still describes the retired single-account `crm_pipeline` upsert path as current. |
| 7 weekly-snapshot files + `[slug].astro` stub | Deleted | VERIFIED | Confirmed deleted per 07-03-SUMMARY self-check and 07-04's `dist/` build-output check. |
| `supabase/functions/acculynx-sync/index.ts` (multiAccount path) | Keeps `crm_pipeline` current for all 8 accounts hourly | MISSING (functionally) | File exists and runs, but the specific behavior the phase goal depends on (crm_pipeline freshness) is absent from this code path. |
| `supabase/functions/acculynx-sync/resources/job-walk.ts` | Populates job_contacts/financials/insurance/invoices with real values | STUB-EQUIVALENT | Code runs and calls all the right endpoints, but its writes are rejected by PostgREST for effectively all rows due to camelCase/snake_case mismatch, and the failure is invisible (console.warn only). Functionally equivalent to a stub for the phase's completeness-proof requirement. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `pipeline.astro` | `loadExecutivePipelineDashboard` | SSR import + call | WIRED | Confirmed in Task 1 of 07-02. |
| `scripts/executive-pipeline.ts` | `/api/executive/pipeline.json` | fetch on filter change + poll | WIRED | `setInterval` + fetch calls present. |
| `crm_pipeline.acculynx_job_id` | `acculynx_jobs.id` | in-memory join for account_key/job_category_name | WIRED (code) / STARVED (data) | The join logic in the loader is correct, but the left side (`crm_pipeline`) is frozen — the join has nothing current to join against for jobs synced after the multiAccount cutover. |
| `runAccountSync` (multiAccount) | `crm_pipeline` upsert | expected hourly write path | NOT_WIRED | Confirmed by direct source read: no such call exists in `runAccountSync` or anything it invokes. |
| `job-walk.ts` API bodies | `acculynx_job_financials`/`job_contacts`/`job_insurance`/`invoice_lines` tables | field-mapped upsert | PARTIAL/BROKEN | The upsert calls exist and execute, but field mapping is a raw spread of camelCase API JSON into snake_case columns — PostgREST rejects the mismatched rows; only the warning path is wired, not a working write path. |
| `job-walk.ts` inline watermark advance | `acculynx_sync_watermark` | `.update()` by (account_key, resource_type) | NOT_WIRED for unseeded rows | Silently no-ops (zero rows matched) when no watermark row was ever seeded for a given (account_key,'job_walk') pair — confirmed by direct comparison against the working `advanceWatermark()` upsert helper the file does NOT use here. |
| `job-walk.ts`/upsert failures | `check_acculynx_alerts()` | error visibility | NOT_WIRED | `176-acculynx-alert-check-fn.sql`'s four D-05 conditions (failed dispatch >=400, stale watermark >3h, reconciliation delta >2%, unreconciled pg_net >30min) have no path to see a `console.warn`-only row-level upsert rejection. |
| `executive-pipeline.ts` | `data_source`-based dedup | csv_initial vs api_sync precedence | NOT_WIRED | `data_source` is selected but never used again in the file. |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| REQ-10 | 07-01, 07-02, 07-03, 07-04 | Realtime Executive Sales Pipeline dashboard, replacing the weekly snapshot, proving full multi-location data is present | BLOCKED | The dashboard surface (UI, deploy, spec) is delivered and live. The requirement's core promise — "proves the full multi-location data is present" — is false on the current data layer: crm_pipeline is frozen for all 8 accounts under the hourly cron, sub-resource writes silently fail, financials/reps are not mapped forward, wichita is budget-starved, and duplicate rows exist without dedup. REQ-10 is not satisfied end-to-end. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `supabase/functions/acculynx-sync/resources/job-walk.ts` | ~110-155 (job_contacts/financials/insurance), invoice_lines block | Raw spread of external API response into DB row (`{...c, ...}`) with no field mapping | Blocker | Causes near-100% PostgREST rejection for every downstream sub-resource table; root cause of gaps 2 and 3. |
| `supabase/functions/acculynx-sync/resources/job-walk.ts` | multiple `if (error) console.warn(...)` sites | Silent-failure error handling — write failures never counted/escalated | Blocker | Makes the failure mode invisible to `check_acculynx_alerts()` and to operators; "the walk reports ok" while writes fail. |
| `supabase/functions/acculynx-sync/resources/job-walk.ts` | ~240-247 | Inline `.update()` watermark advance instead of the existing `advanceWatermark()` upsert helper | Blocker | Silently no-ops on unseeded rows, causing the walk to restart from scratch every run for any account without a pre-seeded job_walk watermark row (wichita). |
| `app/command-center/src/lib/executive-pipeline.ts` | 1141 / 1455 | `data_source` selected but never used for dedup | Warning | Exposes every crm_pipeline-derived KPI to duplicate-row double-counting (5,578 orphaned csv_initial rows). |
| `docs/knowledge-base/acculynx/ingestion/sync-pipeline.md` | 21, 42 | Documentation describes a data-flow (`multiAccount` path writes crm_pipeline) that does not exist in the current code | Warning | Misleads future agents/humans into trusting a stale doc over the live pipeline — matches the CLAUDE.md "verify against the live DB" memory lesson exactly. |

### Human Verification Required

### 1. Re-run the Task 3 live-data checkpoint after gap closure

**Test:** Once the crm_pipeline/job-walk/watermark/dedup fixes land, re-visit `https://cc.proexteriorsus.net/executive/pipeline` and re-run all 7 items in 07-04-PLAN.md's `<how-to-verify>` list (nav label, weekly-snapshot 404 from an authenticated session, all 8 locations filterable, freshness badges honest, margin-coverage caption present, AccuLynx drill-down link, mobile responsive) — plus explicitly check that a job (e.g. a wichita job, or KS-11-equivalent) does not appear twice with conflicting values.
**Expected:** All 8 locations show data that is current within the hourly SLA; no location shows a "ready" freshness badge while its underlying crm_pipeline rows are actually stale/absent; margin coverage numbers are real and improving as job-walk field-mapping fixes land; no duplicate job rows skew funnel/pipeline-value counts.
**Why human:** This is precisely the checkpoint that already caught the data-quality failure once (per the task's supplied live findings) — it is a judgment call on live production data, not something a grep/build check can re-certify.

## Gaps Summary

The Phase 7 UI/deploy layer (SC1, SC2's interactivity, SC4) is genuinely built and live — this is not a case of a stub component or an unwired route. The dashboard renders, filters, drills down, polls, and is deployed with a confirmed buildCommit flip.

The failure is entirely in the data layer the dashboard depends on, and it is severe enough to falsify the phase goal's central claim ("proves the full multi-location data is present"):

1. **crm_pipeline is frozen.** The Phase 3 multiAccount hourly cutover (index.ts) never carried the crm_pipeline upsert forward from the retired legacySyncJobs path — the dashboard's source-of-truth table has not been written by the live cron since the cutover.
2. **Sub-resource writes silently fail.** job-walk.ts's raw camelCase→snake_case spread causes near-total PostgREST rejection for job_contacts/financials/insurance/invoices/invoice_lines, and the failure is swallowed by console.warn — invisible to check_acculynx_alerts().
3. **Financials and reps never reach crm_pipeline.** Even where the API has the data (proven live via job KS-11: approvedJobValue/balanceDue present, company rep present via full /representatives), no code path maps it into contract_amount/balance_due/primary_salesperson.
4. **Wichita (and any freshly-registered account) is starved.** A raw `.update()` watermark advance no-ops on unseeded rows, causing the job-walk to restart every run; combined with the shared serial-loop budget, colorado can consume the whole run before wichita's turn.
5. **Duplicate rows are uncontrolled.** 5,578 orphaned csv_initial rows without acculynx_job_id can double-count against their api_sync twins; the loader selects but never uses data_source to dedup.
6. **Documentation drift.** sync-pipeline.md still describes the retired crm_pipeline write path as current, which would mislead the next engineer/agent who trusts the doc over the live DB.

None of these are hypothetical — each was independently corroborated by direct reads of `supabase/functions/acculynx-sync/index.ts`, `resources/job-walk.ts`, `lib/watermark.ts`, `176-acculynx-alert-check-fn.sql`, and `app/command-center/src/lib/executive-pipeline.ts` during this verification pass, matching the live-DB/live-API investigation findings supplied with this task.

A gap-closure plan should sequence: (a) add crm_pipeline upsert/mapping to the multiAccount path including financials→contract_amount/balance_due and full-representatives→primary_salesperson; (b) add explicit snake_case field maps in job-walk.ts for every sub-resource table; (c) promote job-walk write failures to a counted/queryable error surface visible to check_acculynx_alerts(); (d) seed job_walk watermark rows for every account (or switch to the advanceWatermark() upsert helper) and add budget rotation so wichita is never starved; (e) define and implement a csv/api row dedup strategy in the loader or upstream; (f) fix sync-pipeline.md's doc drift. Only after these land should the Task 3 human-verify checkpoint be re-run.

---

*Verified: 2026-07-02*
*Verifier: Claude (gsd-verifier)*
