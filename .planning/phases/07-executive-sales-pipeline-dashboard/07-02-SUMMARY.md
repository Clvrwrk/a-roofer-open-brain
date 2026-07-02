---
phase: 07-executive-sales-pipeline-dashboard
plan: 02
subsystem: ui
tags: [astro, chart.js, supabase, executive-dashboard, ssr, vanilla-ts]

# Dependency graph
requires:
  - phase: 07-01
    provides: loadExecutivePipelineDashboard pure-core loader (funnel, close rate, margin breakdowns, freshness, AR) over crm_pipeline
provides:
  - "SSR page at /executive/pipeline (replaces the [slug].astro stub default route)"
  - "Allowlisted GET /api/executive/pipeline.json (location/region/type/window fixed-set validation, rep sanitized not allowlisted)"
  - "Client script (executive-pipeline.ts) — Chart.js mount, in-place filter re-fetch, per-location expandable-row drill-down, 5-min silent poll"
  - "Invoice-Audit-derived .epl-* layout system (toolbar / dense fixed-height KPI grid / per-location expandable rows) reusable by future exec dashboards"
  - "Queue model (Leads/Prospects/Approved/Invoiced/Closed) + Res/Com KPI splits + Average Ticket + snapshot close-rate formula + trailing-7d pill row, all as pure-core functions in executive-pipeline.ts"
affects: [08, any future executive/reporting dashboard, any phase touching crm_pipeline aggregation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Invoice-Audit layout system (.iv-toolbar/.iv-kpis/.iv-office) re-expressed as .epl-toolbar/.epl-kpis/.epl-location — dense, fixed-height, number-first exec dashboards; adopt for future exec-facing pages instead of the original bespoke .snapshot-hero/.live-metric-* composition"
    - "Single upstream filter point (excludeClosedAndPaidInFull(), semantics evolved to dead/cancelled exclusion) applied once before every KPI/chart/table/drill-down aggregation — avoids per-KPI special-casing"
    - "Non-fixed-set filter values (rep) are sanitized (length cap + safe-char pattern) for in-memory JS equality filtering rather than allowlisted, because they never reach a Supabase .eq()/.in() call — allowlisting is reserved for values that do"
    - "Inline custom Chart.js plugin (stackedSegmentLabelPlugin, afterDatasetsDraw) for centered stacked-bar data labels instead of adding chartjs-plugin-datalabels — keeps the third-party-tool gate (hard rule 12) surface closed"
    - "Client-script formatter duplication (formatCompactCurrency copied, not imported, into the browser bundle) to guarantee SSR/client re-render agreement without a shared browser/server import boundary"

key-files:
  created:
    - app/command-center/src/pages/executive/pipeline.astro
    - app/command-center/src/pages/api/executive/pipeline.json.ts
    - app/command-center/src/scripts/executive-pipeline.ts
  modified:
    - app/command-center/src/lib/executive-pipeline.ts (queue model, Res/Com splits, Average Ticket, snapshot close rate, stacked funnel/leaderboard split, trailing-7d totals — all added on top of the 07-01 pure core)
    - .planning/phases/07-executive-sales-pipeline-dashboard/07-UI-SPEC.md (4 user-directed amendments recording the checkpoint feedback rounds)

key-decisions:
  - "Layout rejected on first checkpoint pass (grade F) — replaced the original bespoke .snapshot-hero/.live-metric-* composition wholesale with a direct re-expression of the vetted Invoice Audit system (.epl-toolbar/.epl-kpis/.epl-location), collapsing the 9-pill freshness wall into a one-line status strip and merging the separate profitability-breakdown + drill-down panel into per-location expandable rows"
  - "Exclusion rule went through two revisions: round 2 excluded closed/paid-in-full (paid-in-full has no distinct milestone value in prod, so closed alone covered the user's instruction); round 3 superseded this — closed is now its own visible queue with AR shown, and the actual exclusion is dead/cancelled"
  - "Close rate is two different numbers by design: the pre-existing windowed computeCloseRate() (used for Sold Value/Jobs Sold KPIs) versus the new computeSnapshotCloseRate() (count-based, ignores the time window entirely, per the user's explicit instruction) — both ship, captioned so neither is mistaken for the other"
  - "Res/Com segmentation is by ACCOUNT, not job_category_name: multi_family_commercial is the only commercial account; every other account (insurance_program + six geo locations) is residential"
  - "Stacked collected/AR chart labels are drawn via a small inline Chart.js plugin rather than adding chartjs-plugin-datalabels, to keep the third-party-tool gate (CLAUDE.md hard rule 12) surface closed"
  - "Trailing-7d pill row uses a fixed [today-7d, today) window deliberately independent of the D-03 window selector, per the user's explicit point that this strip must always read 'current' regardless of the selected KPI window"

patterns-established:
  - "Pattern: checkpoint feedback loops are recorded as dated amendment sections in the phase's UI-SPEC.md (amendment #1-#4), each with a verbatim-directive summary, the exact contract change, and a live-prod-DB before/after measurement — future plans touching the same page read the amendments, not just the original spec"
  - "Pattern: honesty captions (margin coverage, close-rate qualifier, 'No cost data available') are structural, not optional copy — carried through every rework round unchanged"

requirements-completed: [REQ-10]

coverage:
  - id: D1
    description: "SSR page at /executive/pipeline renders on first paint from live DB data (KPI grid, per-location expandable rows, 2 charts, status strip)"
    requirement: "REQ-10"
    verification:
      - kind: manual_procedural
        ref: "human-verify checkpoint (Task 3), approved after 4 feedback rounds"
        status: pass
    human_judgment: true
    rationale: "Visual layout, chart rendering, and honesty-caption correctness require human eyes; the checkpoint explicitly iterated 4 times on layout/data before approval."
  - id: D2
    description: "Allowlisted /api/executive/pipeline.json GET endpoint (location/region/type/window fixed-set validation before any Supabase filter; rep sanitized, not allowlisted, since it never reaches a Supabase filter)"
    requirement: "REQ-10"
    verification:
      - kind: unit
        ref: "app/command-center/src/lib/executive-pipeline.test.ts (pure-core aggregation + filter coverage, part of the 171-test suite)"
        status: pass
      - kind: manual_procedural
        ref: "curl http://127.0.0.1:4321/api/executive/pipeline.json against live prod DB (recorded in UI-SPEC amendments #2-#4)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Client script mounts responsive Chart.js charts (funnel + leaderboard, both stacked collected/AR split in round 4), wires filter-bar in-place re-render, per-location expandable-row drill-down, and a 5-min silent poll that preserves filters/open rows"
    requirement: "REQ-10"
    verification:
      - kind: manual_procedural
        ref: "human-verify checkpoint (Task 3), approved after round 4 (stacked charts + trailing-7d pills)"
        status: pass
    human_judgment: true
    rationale: "Chart rendering fidelity, in-place re-render behavior, and poll non-disruption require human observation of a live dev session; automated build/test only proves the code compiles and pure functions are correct."
  - id: D4
    description: "Queue model (Leads/Prospects/Approved/Invoiced/Closed), Res/Com KPI splits, Average Ticket, and snapshot close-rate formula implemented as pure-core functions with full test coverage"
    requirement: "REQ-10"
    verification:
      - kind: unit
        ref: "app/command-center/src/lib/executive-pipeline.test.ts (171/171 passing, includes round-3 and round-4 additions — 14 new cases for stacked split/trailing-7d alone)"
        status: pass
    human_judgment: false
  - id: D5
    description: "npm run build completes clean and the full vitest suite is green at final state"
    verification:
      - kind: integration
        ref: "npm run build (app/command-center) — 0 errors"
        status: pass
      - kind: unit
        ref: "npx vitest run — 18 files, 171/171 tests passing"
        status: pass
    human_judgment: false

# Metrics
duration: ~2h (across 4 checkpoint feedback rounds)
completed: 2026-07-01
status: complete
---

# Phase 07 Plan 02: Executive Dashboard UI Surface Summary

**SSR `/executive/pipeline` dashboard (Invoice-Audit-derived layout) with a queue model, Res/Com KPI splits, snapshot close rate, stacked collected/AR charts, and a trailing-7d pill row — approved after 4 user-directed checkpoint rework rounds.**

## Performance

- **Duration:** ~2h across the original 2 tasks plus 4 checkpoint feedback rounds
- **Completed:** 2026-07-01
- **Tasks:** 3 (2 auto + 1 checkpoint, approved on the 5th verification pass)
- **Files modified:** 4 core (page, API route, client script, pure-core lib) + UI-SPEC.md amendments

## Accomplishments
- Built the SSR page, allowlisted JSON API route, and Chart.js-mounting client script called for by the plan
- Absorbed 4 rounds of user checkpoint feedback into both the shipped code and dated UI-SPEC.md amendments, converging on a materially different (and better) dashboard than originally speced
- Extended the 07-01 pure core with a queue model, Res/Com segmentation, Average Ticket, a snapshot (window-independent) close-rate formula, stacked collected/AR chart data, and a fixed trailing-7-day pill row — all covered by unit tests
- Verified every measurement against the live prod DB at each round (not synthetic fixtures), surfacing honest data gaps (see Data Findings below) rather than papering over them

## Task Commits

Original plan tasks:
1. **Task 1: SSR page + allowlisted JSON API route** - `1cbd6b3` (feat)
2. **Task 2: Client script — Chart.js mount, filter re-fetch, drill-down, poll** - `b8e0a4d` (feat)
3. **Task 3: Human checkpoint** - approved after 4 feedback rework rounds (see below)

Checkpoint feedback rework rounds (Rule-4-equivalent user-directed changes, executed as fix commits between checkpoint re-verifications):

- **Round 1 — layout rejected ("grade F"):**
  - `be708b3` fix: add allowlisted per-location job drill-down + exclude sandbox from freshness
  - `9d4c259` fix: add per-location rollup metrics to the pipeline dashboard payload
  - `41495db` fix: rework dashboard UI per checkpoint rejection — adopt Invoice Audit layout
- **Round 2 — data exclusion ("eliminate closed and paid in full"):**
  - `a5ec760` fix: exclude closed/paid-in-full jobs from pipeline dataset
- **Round 3 — KPI/data-model rework (queue model, Res/Com splits, rep filter, snapshot close rate):**
  - `c0bb0e1` fix: rework pipeline core for queue model, Res/Com segments, snapshot close rate
  - `e59dd72` fix: add rep filter to the executive pipeline JSON endpoint
  - `fd9bf9b` fix: rework pipeline dashboard UI for queue values, Res/Com pills, rep filter
  - `1959047` docs: record checkpoint round 3 KPI/data-model rework in UI-SPEC.md
- **Round 4 — stacked collected/AR charts + trailing-7d pill row:**
  - `9c4860a` fix: pure-core collected/AR split + trailing-7d aggregation
  - `65e1b8c` fix: stacked collected/AR charts + trailing-7d pill row
  - `aa32aa3` docs: record checkpoint round 4 stacked-chart + trailing-7d amendment

**Plan metadata:** (this commit) `docs(07-02): complete executive dashboard UI surface plan — approved after 4 checkpoint rounds`

## Files Created/Modified
- `app/command-center/src/pages/executive/pipeline.astro` - SSR page; Invoice-Audit-derived `.epl-*` layout (toolbar, dense KPI grid, per-location expandable rows, 2 stacked charts)
- `app/command-center/src/pages/api/executive/pipeline.json.ts` - allowlisted GET endpoint (location/region/type/window fixed-set validation; rep sanitized); WorkOS-gated, not added to any public allowlist
- `app/command-center/src/scripts/executive-pipeline.ts` - Chart.js mount (tree-shaken registration), in-place filter re-fetch, per-location expandable-row drill-down, 5-min silent poll, stacked-segment label plugin
- `app/command-center/src/lib/executive-pipeline.ts` - pure core extended across rounds 2-4: exclusion filter, queue model, Res/Com segmentation, Average Ticket, snapshot close rate, funnel/leaderboard stacked split, trailing-7d totals, compact currency formatter
- `.planning/phases/07-executive-sales-pipeline-dashboard/07-UI-SPEC.md` - 4 dated amendment sections recording each checkpoint round's verbatim directive, contract change, and live-DB measurement

## Decisions Made
- Layout system replaced wholesale after round-1 rejection: adopted the vetted Invoice Audit `.iv-toolbar`/`.iv-kpis`/`.iv-office` pattern (re-expressed as `.epl-*` using existing tokens) instead of iterating on the original bespoke `.snapshot-hero`/`.live-metric-*` composition
- Exclusion semantics revised twice: round 2 excluded `closed`/`paid-in-full` (no distinct "paid in full" milestone exists in prod, so `closed` alone satisfied the instruction); round 3 superseded this entirely — `closed` became its own visible queue, and the real exclusion is `dead`/`cancelled`
- Two close-rate numbers ship deliberately: the pre-existing windowed `computeCloseRate()` (Sold Value/Jobs Sold KPIs) and the new `computeSnapshotCloseRate()` (count-based, window-independent, per the user's exact formula) — captioned to avoid confusion
- Res/Com segmentation is by account (`multi_family_commercial` = commercial, everything else = residential), not by `job_category_name`
- Rep filter values are sanitized (length cap + safe-char pattern) rather than allowlisted, since `primary_salesperson` is data-driven and never reaches a Supabase `.eq()`/`.in()` call (in-memory JS filtering only) — allowlisting stays reserved for values that do reach a Supabase filter (location/region/type/window)
- Stacked chart data labels use a small inline Chart.js plugin instead of adding `chartjs-plugin-datalabels`, keeping the third-party-tool gate (CLAUDE.md hard rule 12) surface closed
- Trailing-7d pill row uses a fixed `[today-7d, today)` window, deliberately independent of the D-03 window selector, per the user's explicit instruction that it read "always current"

## Deviations from Plan

### Auto-fixed / User-directed Issues

**1. [Rule 4-equivalent — user-directed architectural rework] Layout system replaced after checkpoint rejection**
- **Found during:** Task 3 (first checkpoint pass)
- **Issue:** The original bespoke `.snapshot-hero`/`.live-metric-*` layout (9-pill freshness wall, separate KPI row, separate profitability-breakdown grid, separate two-panel drill-down) was rejected outright ("grade F")
- **Fix:** Adopted the vetted Invoice Audit layout system wholesale (`.epl-toolbar`/`.epl-kpis`/`.epl-location`), collapsed freshness to a one-line status strip, merged the profitability breakdown and drill-down into per-location expandable rows
- **Files modified:** `pipeline.astro`, `executive-pipeline.ts` (client script), `executive-pipeline.ts` (lib)
- **Commits:** `be708b3`, `9d4c259`, `41495db`

**2. [Rule 4-equivalent — user-directed data model change] Exclusion rule and KPI/queue model reworked**
- **Found during:** Task 3 (rounds 2-3 checkpoint passes)
- **Issue:** User required a data exclusion the original plan didn't specify, then a full queue-model/Res-Com-split/rep-filter/snapshot-close-rate rework
- **Fix:** Round 2 added `excludeClosedAndPaidInFull()`; round 3 superseded it with the `dead`/`cancelled` exclusion, five-queue model, Res/Com pills, Average Ticket KPI, rep filter, and `computeSnapshotCloseRate()`
- **Files modified:** `executive-pipeline.ts` (lib + client script + API route), `07-UI-SPEC.md`
- **Commits:** `a5ec760`, `c0bb0e1`, `e59dd72`, `fd9bf9b`, `1959047`

**3. [Rule 4-equivalent — user-directed additive enhancement] Stacked collected/AR charts + trailing-7d pill row**
- **Found during:** Task 3 (round 4 checkpoint pass)
- **Issue:** User requested both charts split into Collected vs. AR-outstanding segments and a new always-current trailing-7-day totals strip
- **Fix:** Added `computeFunnelStagesWithSplit()`/`computeLeaderboardWithSplit()`, an inline Chart.js label plugin, and `computeTrailing7dTotals()`/`trailing7DayRange()` with a 5-pill UI row
- **Files modified:** `executive-pipeline.ts` (lib + client script), `07-UI-SPEC.md`
- **Commits:** `9c4860a`, `65e1b8c`, `aa32aa3`

---

**Total deviations:** 3 user-directed rework rounds (all Rule-4-equivalent — explicit user direction at the checkpoint, not autonomous judgment calls), spanning 10 fix/docs commits between the two original task commits and final approval.
**Impact on plan:** Every rework round was executed exactly as the user specified after clarifying questions; none introduced scope beyond what was requested. The shipped dashboard is materially more useful (queue model, Res/Com splits, rep filter, AR visibility) than the original plan's spec, and every change is traced in dated UI-SPEC.md amendments.

## Issues Encountered
None beyond the checkpoint feedback rounds documented above — no blocking technical issues, auth gates, or build failures across the 4 rounds.

## Data Findings (honest state of the underlying data, recorded for downstream awareness)

These are not bugs — they are the current state of the live production data, measured directly against the prod DB at each checkpoint round and surfaced honestly in the UI (captions, `$0` shown rather than hidden) rather than papered over:

- **`primary_salesperson` (`crm_pipeline`) is the only populated assigned-rep field in production.** `acculynx_jobs` (including its raw AccuLynx API payload) carries no assign/rep/owner/sales-shaped field at all (verified across a 50-row raw-payload sample). Coverage: 5,959/7,053 rows (84.5%) overall; 1,416/1,670 rows (84.8%) after the dead/cancelled exclusion; 50 distinct reps post-exclusion. The Rep filter and leaderboard both key on this field — roughly 15% of rows have no assignable rep.
- **`contract_amount` is `$0` on recent approvals.** All 8 approved-in-window jobs measured at round 3/4 checkpoints have `contract_amount = 0`, which zeroes both the Average Ticket KPI and the trailing-7d "New Contracts"/"Invoiced" dollar totals for the measured window — counts are still meaningful, dollars are not (yet) for this slice.
- **`balance_due` is `$0` for every row in production, across every milestone.** This makes the entire AR-outstanding machinery (per-location AR $, the Closed queue's AR chip, the stacked chart's red AR segment, the label-skip threshold) currently dark — not broken. The stacked chart's centered-label plugin already skips zero-value/sub-legibility segments, so today every chart renders as a clean single-color "Collected" bar with no visible red. The dashboard is built to "come alive" with a visible AR segment the moment `balance_due` data lands, with no code change required.
- **No distinct "paid in full" milestone value exists** in either `crm_pipeline` (`dead`/`cancelled`/`closed`/`assigned_lead`/`prospect`/`invoiced`/`approved`/`unassigned_lead`/`completed`) or `acculynx_jobs` (`Cancelled`/`Closed`/`Lead`/`Invoiced`/`Prospect`/`Approved`/`Completed`) milestone vocabularies — round 2's exclusion filter treated `closed` as satisfying the user's "closed and paid in full" instruction on that basis, before round 3 superseded the exclusion rule entirely.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `/executive/pipeline` is live on local dev against the prod DB and approved by the user; ready for the phase's remaining plans (07-03, 07-04) to build on the same pure-core loader and `.epl-*` layout system
- The Invoice-Audit-derived `.epl-*` layout pattern is now a proven, reusable pattern for future dense exec-facing dashboards — prefer it over the original bespoke `.snapshot-*` composition
- AR-outstanding UI (chart segments, AR chips) is fully wired but will render as all-zero/invisible until `balance_due` data is populated upstream — no blocker, just a known dark path worth flagging to whoever owns that data pipeline
- `contract_amount` gaps on recent approvals mean Average Ticket and several trailing-7d dollar figures will read `$0` until that field populates for new approvals — same "wired but dark" situation, not a defect in this plan's code

---
*Phase: 07-executive-sales-pipeline-dashboard*
*Completed: 2026-07-01*
