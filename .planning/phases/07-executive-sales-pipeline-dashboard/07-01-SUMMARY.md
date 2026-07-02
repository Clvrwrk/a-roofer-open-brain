---
phase: 07-executive-sales-pipeline-dashboard
plan: 01
subsystem: database
tags: [supabase, postgrest, vitest, tdd, acculynx, chart.js, astro]

requires:
  - phase: 07-executive-sales-pipeline-dashboard
    provides: "07-CONTEXT.md locked decisions (D-01..D-13), 07-RESEARCH.md live-DB pitfalls, 07-PATTERNS.md analog file map, 07-UI-SPEC.md copywriting contract"
provides:
  - "loadExecutivePipelineDashboard(filters?) SSR loader for the /executive/pipeline dashboard"
  - "Supabase-free pure aggregation core: groupPipelineFunnel, computeCloseRate, computeMarginByDimension, deriveRegionOffice, filterByWindow, computeFreshnessBadges, paginateRange"
  - "chart.js@4.5.1 pinned dependency for the funnel/leaderboard/trend charts Plan 02 will render"
  - "Live-DB re-verified margin coverage numbers at implementation time (acculynx_job_financials 1 archived row; v_invoice_acculynx_match 151/995 matched, 15.2%)"
affects: [07-executive-sales-pipeline-dashboard-plan-02, 07-executive-sales-pipeline-dashboard-plan-03]

tech-stack:
  added: ["chart.js@4.5.1"]
  patterns:
    - "selectAll() .range() pagination loop (copied from weekly-snapshot.ts) for every full-table Supabase query"
    - "Unconfigured/degraded guard returns a payload with errors: string[] instead of throwing to SSR"
    - "Margin-%-with-coverage: MarginCoverage {jobsWithCostData, totalJobsInSlice, coveragePct} attached to every dimension slice, never a bare percentage"
    - "Region/office/commercial-residential derived via acculynx_jobs.account_key/job_category_name in-memory join, never crm_pipeline.market"

key-files:
  created:
    - app/command-center/src/lib/executive-pipeline.ts
    - app/command-center/src/lib/executive-pipeline.test.ts
  modified:
    - app/command-center/package.json
    - app/command-center/package-lock.json

key-decisions:
  - "acculynx_job_financials has no true gross-profit column even in schema (approved_job_value, worksheet_total, etc. — no grossProfit field); modeled the primary margin path as worksheet_total > 0 on non-archived rows, which is currently empty in production (0 non-archived rows), so the invoiced-cost fallback is the only live margin path — matches RESEARCH.md's documented finding exactly"
  - "v_invoice_acculynx_match already carries acculynx_job_id directly (it's a view, not a raw join table) — no additional join step was needed beyond summing abc_invoice_lines.extended_price per invoice_number and attributing to the matched job"
  - "office and region breakdowns both map to acculynx_jobs.account_key for v1 (Open Question 3: all 8 accounts treated as peer location entries per D-13's plain global-filter-bar choice) — marginByOffice reuses marginByRegion's computation rather than duplicating logic"
  - "Fixed an overly strict assertion in my own RED test for the close-rate qualifier (it forbade any 'cohort conversion rate' substring, which incorrectly also matched inside the intended disclaiming phrase 'not a cohort conversion rate'); corrected to validate intent (must disclaim cohort-level rigor) rather than exact wording"

patterns-established:
  - "Pure Supabase-free aggregation functions take already-fetched plain-object rows and a join array, keeping every REQ-10 honesty guarantee unit-testable without a live DB"
  - "Every margin computation function takes a dimensionOf(row, jobs) callback so region/office/commercial-residential/rep breakdowns share one implementation"

requirements-completed: [REQ-10]

coverage:
  - id: D1
    description: "Pipeline funnel groups crm_pipeline rows by normalized lowercase current_milestone, never Title-Case acculynx_jobs vocabulary"
    requirement: "REQ-10"
    verification:
      - kind: unit
        ref: "app/command-center/src/lib/executive-pipeline.test.ts#funnel grouping"
        status: pass
    human_judgment: false
  - id: D2
    description: "Close rate uses the snapshot-window proxy (sold-milestone count / lead-milestone count, both windowed) with a mandatory period-snapshot-not-cohort qualifier"
    requirement: "REQ-10"
    verification:
      - kind: unit
        ref: "app/command-center/src/lib/executive-pipeline.test.ts#close rate"
        status: pass
    human_judgment: false
  - id: D3
    description: "Margin-by-dimension prefers job-financials GP, falls back to contract minus invoiced cost, and reports explicit N-of-M MarginCoverage; jobs with no cost data are excluded from the average and counted in the coverage denominator, never treated as 0-cost/100%-margin"
    requirement: "REQ-10"
    verification:
      - kind: unit
        ref: "app/command-center/src/lib/executive-pipeline.test.ts#margin"
        status: pass
    human_judgment: false
  - id: D4
    description: "Region/office/commercial-residential dimensions derive from acculynx_jobs.account_key/job_category_name joined via acculynx_job_id, never from crm_pipeline.market county slugs; null job_category_name maps to 'uncategorized' rather than being dropped"
    requirement: "REQ-10"
    verification:
      - kind: unit
        ref: "app/command-center/src/lib/executive-pipeline.test.ts#region"
        status: pass
    human_judgment: false
  - id: D5
    description: "Full-table Supabase queries paginate via a selectAll() .range() loop so a 6434-row table is fully covered, regression-guarding the PostgREST 1000-row silent-truncation pitfall"
    requirement: "REQ-10"
    verification:
      - kind: unit
        ref: "app/command-center/src/lib/executive-pipeline.test.ts#pagination"
        status: pass
    human_judgment: false
  - id: D6
    description: "Freshness badges flag a location ready within the hourly SLA, review between 1x-2x SLA, critical beyond 2x SLA"
    requirement: "REQ-10"
    verification:
      - kind: unit
        ref: "app/command-center/src/lib/executive-pipeline.test.ts#freshness"
        status: pass
    human_judgment: false
  - id: D7
    description: "chart.js@4.5.1 installed and pinned exactly (not caret-ranged) in package.json/package-lock.json"
    requirement: "REQ-10"
    verification:
      - kind: other
        ref: "grep '\"chart.js\": \"4.5.1\"' app/command-center/package.json"
        status: pass
    human_judgment: false
  - id: D8
    description: "loadExecutivePipelineDashboard SSR loader never throws to SSR on a missing/misconfigured Supabase env — returns a degraded payload with errors: string[]"
    requirement: "REQ-10"
    verification: []
    human_judgment: true
    rationale: "The unconfigured/degraded guard mirrors weekly-snapshot.ts's proven loadLiveData pattern exactly and is exercised implicitly by the full CC test suite staying green, but no test in this plan directly simulates a missing-env SSR call against loadExecutivePipelineDashboard (that exercise belongs to Plan 02's page-level integration, per the plan's task split) — flagging for the verifier rather than asserting an unproven pass."

duration: 6min
completed: 2026-07-02
status: complete
---

# Phase 07 Plan 01: Executive Pipeline Data Layer Summary

**`executive-pipeline.ts` loader + a Supabase-free pure aggregation core (funnel, close rate, margin-with-coverage, region/office derivation, freshness badges), TDD'd against six REQ-10 honesty behaviors, with chart.js@4.5.1 installed as the phase's one new dependency.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-07-02T04:17:59Z
- **Completed:** 2026-07-02T04:24:21Z
- **Tasks:** 2
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments

- Installed and exact-pinned `chart.js@4.5.1` (D-08) — the one new charting dependency for Plan 02's funnel/leaderboard/trend visuals.
- Authored a 17-test RED-then-GREEN vitest suite (`executive-pipeline.test.ts`) covering all six Wave 0 REQ-10 behaviors: funnel grouping, close rate, margin (with two honesty guarantees), region derivation, pagination, and freshness.
- Implemented `executive-pipeline.ts`: a Supabase-free pure core (`groupPipelineFunnel`, `computeCloseRate`, `computeMarginByDimension`, `deriveRegionOffice`, `filterByWindow`, `computeFreshnessBadges`, `paginateRange`) plus `loadExecutivePipelineDashboard(filters?)`, the SSR loader that fetches via `selectAll()` pagination and applies the D-13 global filter bar before computing every KPI.
- Re-verified live-DB coverage numbers at implementation time exactly as RESEARCH.md's "valid until 7 days" note requires (see Decisions Made below) — they matched the research findings precisely, confirming the invoiced-cost fallback is the correct v1 margin computation path.
- Full Command Center vitest suite green: 115/115 tests across 18 files (up from 98/17 pre-phase).

## Task Commits

Each task was committed atomically:

1. **Task 1: Install chart.js@4.5.1 + author the Wave 0 failing test suite** - `0bb87c7` (test)
2. **Task 2: Implement the loader + pure core until the suite is GREEN** - `34124e6` (feat)

_TDD plan: RED (`0bb87c7`) → GREEN (`34124e6`). No REFACTOR commit needed — the GREEN implementation required no follow-up cleanup pass._

## Files Created/Modified

- `app/command-center/src/lib/executive-pipeline.ts` - SSR loader + pure aggregation core (funnel, close rate, margin+coverage, region/office derivation, freshness, pagination helper)
- `app/command-center/src/lib/executive-pipeline.test.ts` - 17-test vitest suite covering the six REQ-10 Wave 0 behaviors
- `app/command-center/package.json` - added `chart.js: 4.5.1` (exact pin, not caret-ranged)
- `app/command-center/package-lock.json` - lockfile regenerated for the pinned version

## Decisions Made

- **Live-DB re-verification (Task 2's mandatory pre-finalization check):** queried `rnhmvcpsvtqjlffpsayu` directly via the Supabase JS client (same client shape the loader uses) immediately before implementing. Results matched RESEARCH.md's findings exactly:
  - `acculynx_job_financials`: 1 total row, 1 archived (0 live/non-archived rows) — the primary GP source is still empty in production.
  - `v_invoice_acculynx_match`: 995 total, 151 matched to an `acculynx_job_id` (~15.2% coverage) — confirms the invoiced-cost fallback is the only currently-viable margin signal, and its own coverage is thin.
  - This means `computeMarginByDimension`'s primary path (job-financials GP) is exercised by unit tests but will not fire against live production data yet; the fallback path is what actually renders for the dashboard's first ship. Both paths are implemented and tested per the plan's contract.
- **`acculynx_job_financials` schema has no `grossProfit` field:** live schema inspection showed columns `approved_job_value`, `balance_due`, `worksheet_total`, `change_order_total`, `insurance_claim_total`, `upgrade_total`, `discount_total`, `supplement_total`, `work_not_doing_total`, `amendments`, `raw` — no direct GP/profit column exists. Modeled the primary-source Map as `worksheet_total > 0` on non-archived rows (the closest structural analog to a computed profit figure); this yields zero live matches today (0 non-archived rows), which is honest given the underlying data, not a workaround.
- **`v_invoice_acculynx_match` already exposes `acculynx_job_id` directly** as a view column (confirmed via live schema inspection) — no separate join table was needed beyond summing `abc_invoice_lines.extended_price` per `invoice_number` and attributing that sum to the matched job.
- **Office and region both key off `account_key`** (Open Question 3, "treat all 8 as peer entries" recommendation) — `marginByOffice` in the returned dashboard payload is the same computed array as `marginByRegion`, not a duplicate independent aggregation, since v1 treats them as the same dimension.
- **Fixed a test-authoring bug in my own RED suite:** the close-rate qualifier test originally asserted the returned string must NOT contain the substring `"cohort conversion rate"` — but the correct, honest qualifier legitimately says "not a cohort conversion rate" as an explicit disclaimer, which the assertion wrongly forbade. Corrected the test to check that the qualifier discloses the period-snapshot nature AND explicitly disclaims cohort-level rigor, rather than forbidding a substring that appears inside the intended disclaimer itself. This was caught and fixed within the same GREEN task, before commit.

## Deviations from Plan

None beyond the test-assertion self-correction documented above (which was a bug in the plan-author's own newly-written test, fixed per Rule 1 — auto-fix bugs — within the same TDD cycle before the GREEN commit).

## Issues Encountered

- `npm install chart.js@4.5.1` initially wrote a caret range (`"^4.5.1"`) to `package.json` per npm's default behavior; the plan's acceptance criteria require an exact pin (`"chart.js": "4.5.1"`, no caret). Corrected via a direct edit and `npm install` to regenerate the lockfile against the pinned version — resolved before the Task 1 commit, not tracked as a deviation since it's a mechanical correction to match the plan's own explicit acceptance criterion.
- `npx astro check` and a direct `tsc --noEmit` are both unavailable in this workspace (`@astrojs/check` and `typescript` are not installed as direct/resolvable devDependencies) — this is the pre-existing "astro-check devDep gap" already logged as a deferred item from Phase 06 Wave 2 (see `context/memory/2026-07-01.md` / STATE.md deferred items), not something introduced by this plan. Substituted `npx astro build` (which succeeded cleanly, confirming no dangling-import or syntax errors) and the vitest suite (which exercises the file's actual runtime behavior including type-relevant object shapes) as the available verification signals.

## User Setup Required

None - no external service configuration required. `chart.js` is a pure client-rendering dependency; all Supabase access continues through the existing `createServerSupabaseClient`/`getRuntimeEnv` pattern with no new secrets.

## Next Phase Readiness

- `loadExecutivePipelineDashboard` and all six pure-core exports are ready for Plan 02 (`executive/pipeline.astro` page + `/api/executive/pipeline.json` route + `scripts/executive-pipeline.ts` client script) to consume directly.
- Plan 02 should be aware: the margin primary path (`acculynx_job_financials`) will currently return zero live matches (0 non-archived rows in production) — the dashboard's margin cards will render via the invoiced-cost fallback path for the near term. This is the honest, expected behavior per RESEARCH.md, not a bug to chase in Plan 02.
- No blockers. Full CC test suite is green; nothing pushed to origin (per this plan's sequential-executor constraint — commits are local only).

## Self-Check: PASSED

- FOUND: `app/command-center/src/lib/executive-pipeline.ts`
- FOUND: `app/command-center/src/lib/executive-pipeline.test.ts`
- FOUND: `.planning/phases/07-executive-sales-pipeline-dashboard/07-01-SUMMARY.md`
- FOUND: commit `0bb87c7` (Task 1, test/RED)
- FOUND: commit `34124e6` (Task 2, feat/GREEN)
- FOUND: commit `aad6649` (docs, this SUMMARY)

---
*Phase: 07-executive-sales-pipeline-dashboard*
*Completed: 2026-07-02*
