---
type: Reference
title: Executive Sales Pipeline Dashboard — Spec (D-07)
description: As-built spec for /executive/pipeline — KPIs, join map, margin-coverage contract, chart pick, freshness architecture.
resource: https://cc.proexteriorsus.net/executive/pipeline
tags: [acculynx, dashboard, executive, crm_pipeline, chart.js, margin, freshness]
timestamp: 2026-07-02T00:00:00Z
---

# Executive Sales Pipeline Dashboard

**Route:** `/executive/pipeline` (WorkOS-gated, replaces the retired `/weekly-snapshot`).
**Nav:** Executive tab → "Sales Pipeline".
**Requirement:** REQ-10. **Phase:** 07-executive-sales-pipeline-dashboard.
**Status:** AS-BUILT — this document describes what shipped after 4 user-directed
checkpoint rework rounds, not the original plan. Where this doc conflicts with
`07-RESEARCH.md`/`07-UI-SPEC.md`'s original body text, THIS document and the
`07-UI-SPEC.md` dated amendment sections govern.

Source: `app/command-center/src/lib/executive-pipeline.ts` (pure core + SSR loader),
`app/command-center/src/pages/executive/pipeline.astro` (SSR page),
`app/command-center/src/pages/api/executive/pipeline.json.ts` (allowlisted JSON API),
`app/command-center/src/scripts/executive-pipeline.ts` (Chart.js mount + client re-fetch).

# KPIs (as-built)

Layout: a dense, fixed-height `.epl-kpis` stat-card grid (Invoice-Audit-derived —
cards never grow with content), plus per-location expandable rows that double as the
D-09 two-level drill-down.

## KPI card row

Each of these renders as a Residential/Commercial split pill pair
(`segmentForAccountKey()` — see Data Join Map) inside one fixed-height card:

1. **Pipeline Value (pre-close)** — `preClosePipelineValue()`: prospects-with-an-estimate
   only (`primary_estimate_amount > 0`), summed. This is the headline pre-close number,
   NOT a sum of every open job (that was round-2/3's superseded definition — see
   Amendment History below).
2. **Sold Value / Jobs Sold** — windowed count/value using the pre-existing
   `computeCloseRate()` sold-milestone set, obeys the D-03 time-window selector.
3. **New Leads** — windowed count, by location; count only, no `$` (a lead has no
   contract/estimate value yet by definition).
4. **Close Rate** — TWO distinct numbers ship, captioned so neither is mistaken for
   the other (see Close-Rate Formula below).
5. **Margin %** — margin-%-first (large, 900-weight numeral), coverage caption always
   directly beneath it (see Margin + Coverage Contract below).
6. **Average Ticket** — `computeAverageTicket()`: mean contract value of jobs in the
   Approved queue (with `completed` folded in) whose approved/milestone/updated date
   falls in the selected window, per Res/Com segment.

## Queue model (per-location, five queues)

Each of the 8 production location rows (`KNOWN_ACCOUNT_KEYS`) renders five queue
chips via `computeQueueValues()`:

| Queue | Milestones | Value rule |
|---|---|---|
| Leads | `unassigned_lead`, `assigned_lead` | Count only — `$` intentionally `null` |
| Prospects | `prospect` | Counted/valued ONLY when `primary_estimate_amount > 0`; this sum IS the headline Pipeline Value KPI |
| Approved | `approved` (+ `completed` folded in) | Contract value of approved jobs |
| Invoiced | `invoiced` | Contract value |
| Closed | `closed` | Contract value; AR outstanding shown via the per-location AR $ metric |

`queueForRow()` returns `null` for dead/cancelled rows (excluded globally — see
Exclusion Rule below) as a second, independent guard against double-counting.

## Rep leaderboard + AR rollup

Rep leaderboard keys on `crm_pipeline.primary_salesperson` — the ONLY populated
assigned-rep field in production (verified: `acculynx_jobs`, including its raw API
payload, carries no assign/rep/owner/sales-shaped field at all across a 50-row raw
sample). Coverage at go-live: 5,959/7,053 rows overall (84.5%); 1,416/1,670 rows
(84.8%) after the dead/cancelled exclusion; 50 distinct reps post-exclusion. Both the
toolbar's Rep filter and the leaderboard table key on this field. AR rollup is
per-location `balance_due` sum (see the "balance_due is $0 everywhere" data-gap note
below — the machinery is live-wired but currently dark).

## Trailing-7-day pill row (always current, independent of the window selector)

A fixed `[startOfToday - 7 days, startOfToday)` window — deliberately independent of
the D-03 KPI/chart window selector, per explicit user direction that this strip must
always read "current" regardless of the selected KPI window. `computeTrailing7dTotals()`
+ `trailing7DayRange()`. Five pills, each on its queue's existing date signal (no new
date columns): New Leads (count only), New Pre-close (prospects entering with an
estimate — `$` + count), New Contracts (Approved incl. completed-fold), Invoiced,
Closed. The row set passed in is the filter-bar-filtered pipeline, so
Location/Region/Type/Rep filters still apply — only the date window is fixed.

## Charts (2, both above the fold)

Both charts render as **stacked bars split into "Collected" vs. "AR outstanding"**
(`computeFunnelStagesWithSplit()`, `computeLeaderboardWithSplit()`):

1. **Funnel-by-stage** — horizontal stacked bar, `crm_pipeline.current_milestone`
   (lowercase, normalized — see Pitfall below), stage labels in milestone-normalized
   casing.
2. **Rep leaderboard** — vertical/horizontal bar, capped at the top 8-10 reps by
   default ("Show all" expands via the drill-down table, not a longer chart).

`collected = value - arOutstanding` (floored at 0); `arOutstanding` = summed
`balance_due` (floored at 0 per row). AR segment renders in `--tertiary` (`#c22326`,
`CHART_PALETTE[4]`); Collected renders in `--primary` (`CHART_PALETTE[0]`). Data
labels are white, centered, drawn via a small inline custom Chart.js plugin
(`stackedSegmentLabelPlugin`, `afterDatasetsDraw` hook) — NOT `chartjs-plugin-datalabels`,
keeping the third-party-tool gate (CLAUDE.md hard rule 12) surface closed. A label is
skipped when a segment's value is `$0` or its pixel size is below a legibility floor.

# Data Join Map

`crm_pipeline.acculynx_job_id → acculynx_jobs.id` is the join that resolves both of
the dimensions `crm_pipeline` cannot answer on its own:

- **`account_key`** (the 8-location dimension: `colorado`, `florida`, `georgia`,
  `kansas_city`, `texas`, `wichita`, `insurance_program`, `multi_family_commercial`).
- **`job_category_name`** (commercial / residential / property-management /
  uncategorized — null maps to `uncategorized`, never dropped).

> **`crm_pipeline.market` is NOT the location/account dimension.** `market` is a
> granular county/metro slug (`sedgwick_ks`, `collin_tx`, `denver_co`, `atlanta_ga`,
> `mo_other`, …), not one of the 8 `account_key` values. Using it directly for a
> location filter produces a dropdown of dozens of granular slugs instead of the
> expected 8 clean location names. Always resolve location/office through the
> `acculynx_job_id → acculynx_jobs.account_key` join, never `crm_pipeline.market`.

**Res/Com segmentation is by ACCOUNT, not `job_category_name`.**
`segmentForAccountKey()`: `multi_family_commercial` is the ONLY commercial account;
every other account (`insurance_program` + the six geo locations) is residential.
This is deliberately simpler than a `job_category_name`-based split — see Open
Question 3 resolution below.

**Milestone casing/vocabulary mismatch (Pitfall 5).** `acculynx_jobs.current_milestone`
uses Title Case (`Lead`, `Approved`, `Cancelled`, `Completed`, `Invoiced`, `Closed`,
`Prospect`); `crm_pipeline.current_milestone` uses lowercase (`unassigned_lead`,
`assigned_lead`, `prospect`, `approved`, `completed`, `invoiced`, `closed`,
`cancelled`, `dead`). All pipeline-stage logic filters/groups on
`crm_pipeline.current_milestone` (already normalized) — `acculynx_jobs` is used ONLY
for the `account_key`/`job_category_name` join, never for milestone comparisons.

## Exclusion rule (global, single filter point)

`EXCLUDED_MILESTONES = { dead, cancelled }`, case-insensitive, applied at one filter
point (`excludeClosedAndPaidInFull()` — name retained for call-site continuity;
semantics were superseded in amendment round 3, see History) BEFORE every
KPI/chart/table/drill-down aggregation. `closed` is NOT excluded — it is its own
visible queue with AR outstanding shown.

# Margin + Coverage Contract (D-06)

**Primary source:** AccuLynx job-financials GP (`acculynx_job_financials`,
`worksheet_total > 0` on non-archived rows — the closest structural analog to a
computed profit figure; there is no direct `grossProfit` column in the live schema).
**Fallback:** `contract_amount − invoiced cost`, where invoiced cost is summed
`abc_invoice_lines.extended_price` per invoice, matched to a job via
`v_invoice_acculynx_match.acculynx_job_id` (the view already carries this column
directly — no extra join step needed).

**Presentation is margin-%-first** (large, 900-weight numeral) with dollar profit
secondary. Every margin card/breakdown carries a mandatory coverage caption:

> "{margin%} avg margin — {jobsWithCostData} of {totalJobsInSlice} jobs have cost
> data ({coveragePct}% coverage)"

Zero-coverage slice renders "No cost data available for these jobs yet" — never a
bare "0% margin" and never a hidden/omitted card. **Jobs with no cost data are
excluded from the margin average and counted in the coverage denominator — never
defaulted to 0-cost/100%-margin.**

**Observed live coverage at go-live (2026-07-02, Plan 01 implementation-time
re-verification, matching `07-RESEARCH.md` exactly):**

- `acculynx_job_financials`: 1 total row, 1 archived (0 live/non-archived rows) — the
  primary GP source is empty in production; the primary path is implemented and
  tested but does not fire against live data yet.
- `v_invoice_acculynx_match`: 995 total, 151 matched to an `acculynx_job_id` (~15.2%
  coverage) — the invoiced-cost fallback is the ONLY currently-viable margin signal,
  and its own coverage is thin.
- Net effect: margin % renders via the fallback path for the near term, honestly
  captioned at ~15% coverage rather than presented as fully covered.

# Chart Library (D-08)

**chart.js@4.5.1**, MIT license, exact-pinned (not caret-ranged) in
`app/command-center/package.json`/`package-lock.json`. Verified live via `npm view`
(version/license/repository/no-postinstall-script) — Approved in the Package
Legitimacy Audit (`07-RESEARCH.md`). Selected over Apache ECharts (heavier, ~300KB
tree-shaken) and uPlot (smallest, but architecturally time-series-only — no native
funnel/categorical-bar support, which breaks the funnel requirement). Tree-shaken
registration only (register the specific controllers/elements used, not
`chart.js/auto`). Funnel view is a horizontal stacked-bar proxy, not a dedicated
funnel chart type — no funnel plugin was needed. Mounted vanilla client-side only
(`scripts/executive-pipeline.ts`, module-load time) — never inside Astro frontmatter
(Chart.js requires a real `<canvas>` + browser APis that don't exist during SSR).

# Freshness Architecture (D-12)

Reads `acculynx_sync_watermark` + `v_acculynx_cron_outcomes` at SSR time. As-built
presentation is a **one-line status strip**
("● Data live · oldest sync {X}h ago · {N} locations stale") — NOT the originally
speced 9-pill freshness wall — plus a small `stale` marker inline on the affected
per-location expandable row(s). The sandbox/non-production account is excluded from
freshness display entirely (`KNOWN_ACCOUNT_KEYS` only — sandbox is not a business
location).

**Tone thresholds** (reused from `LiveMetricGrid.astro`'s existing `data-tone`
vocabulary — no new tone was introduced):

| Tone | Condition | Treatment |
|---|---|---|
| `ready` | `last_sync_at` within the hourly SLA | `--secondary-soft` background |
| `review` | 1x–2x the hourly SLA late | `--accent-soft` background + amber border |
| `critical` | beyond 2x the hourly SLA late | `--error-surface` background + red border |

# Filter Bar (D-13)

Global filter bar, sticky under the top bar: Location, Region, Type
(commercial/residential), Rep, and the D-03 time-window selector. Default state: all
locations rolled up, "Last 7 Days" window. Location/Region/Type/Window are fixed-set
values validated via allowlist server-side (`/api/executive/pipeline.json`) before
any Supabase `.eq()`/`.in()` filter is built. **Rep is sanitized, not allowlisted** —
`primary_salesperson` is data-driven (not a fixed compile-time set) and is only ever
used for in-memory JS string-equality filtering, never built into a Supabase filter,
so there is no PostgREST injection surface for an allowlist to defend against; a
length-cap + safe-character sanitizer is applied as defense in depth.

# Resolved Research Open Questions

**OQ1 — Compute margin fallback in TS or back it with a SQL view?**
Resolved: computed entirely in TypeScript in the loader for v1 (no
`v_job_margin_estimate` view added). Faster to iterate, no migration risk; revisit a
materialized/regular view only if it becomes a measurable perf bottleneck at
~7K/6K-row scale (not observed at go-live).

**OQ2 — Exact time-window set?**
Resolved: This Week / Last 7 Days / Month-to-Date / Quarter-to-Date, default "Last 7
Days" (closest analog to the retired weekly ritual). Point-in-time KPIs (Pipeline
Value pre-close, AR) ignore the window entirely, as does the always-current
trailing-7d pill row.

**OQ3 — Treat Insurance Program / Multi-Family Commercial as locations, or as a
cross-cutting program dimension?**
Resolved: all 8 accounts are treated as peer location entries in the filter bar for
v1 (D-13's plain global-filter-bar choice, no compare mode). `marginByOffice` reuses
`marginByRegion`'s computed array rather than a duplicate aggregation, since both key
off `acculynx_jobs.account_key`. The program-vs-geography distinction
(`acculynx_accounts.program` populated only for these two accounts) is noted here for
a future phase to split them if requested — not built in v1.

# Known Data Gaps (honest state at go-live, not bugs)

These were measured directly against the live prod DB across the four checkpoint
rounds and are surfaced honestly in the UI (captions, `$0` shown rather than hidden)
rather than papered over:

- **`balance_due` is `$0` for every row in production**, across every milestone. The
  entire AR-outstanding machinery (per-location AR $, the Closed queue's AR chip, the
  stacked chart's red AR segment, the label-skip threshold) is currently dark — not
  broken. Every chart today renders as a clean single-color "Collected" bar. The
  dashboard is built to "come alive" with a visible AR segment the moment
  `balance_due` data lands, with no code change required.
- **`contract_amount` is `$0` on recent approvals** (all 8 approved-in-window jobs
  measured at go-live). This zeroes both the Average Ticket KPI and the trailing-7d
  "New Contracts"/"Invoiced" dollar totals for the measured window — counts remain
  meaningful, dollars are not yet for this slice.
- **No distinct "paid in full" milestone value exists** in either `crm_pipeline` or
  `acculynx_jobs` milestone vocabularies (see Amendment History — round 2's exclusion
  rule treated `closed` as covering "closed and paid in full" on this basis, before
  round 3 superseded the exclusion rule entirely).
- **Margin % has thin live coverage** (~15.2% via the invoiced-cost fallback; 0% via
  the primary job-financials path) — see Margin + Coverage Contract above.

# Amendment History (checkpoint-driven rework, summarized)

Full verbatim detail lives in `07-UI-SPEC.md`'s dated amendment sections. Summary for
future readers of this spec:

1. **Round 1 (layout rejected, "grade F"):** the original bespoke
   `.snapshot-hero`/`.live-metric-*` composition was replaced wholesale with a direct
   re-expression of the vetted Invoice Audit layout (`.epl-toolbar`/`.epl-kpis`/
   `.epl-location`) — dense fixed-height KPI grid, one-line freshness status strip,
   per-location expandable rows as both breakdown AND drill-down.
2. **Round 2 (data exclusion):** added `excludeClosedAndPaidInFull()` excluding
   `closed`/`paid in full` — later superseded by round 3.
3. **Round 3 (KPI/data-model rework):** superseded round 2's exclusion with
   `dead`/`cancelled` as the real exclusion (`closed` becomes its own visible queue);
   added the five-queue model, Res/Com segmentation by account, Average Ticket,
   `computeSnapshotCloseRate()`, and the Rep filter.
4. **Round 4 (stacked charts + trailing-7d pills):** split both charts into
   Collected/AR-outstanding stacked segments via an inline label plugin; added the
   always-current trailing-7-day pill row.

# Close-Rate Formula (two numbers, by design)

Two distinct close-rate numbers ship, captioned so neither is mistaken for the other:

1. **Windowed close rate** (`computeCloseRate()`, pre-existing, used for the Sold
   Value/Jobs Sold KPIs) — sold-milestone count ÷ lead-milestone count, both filtered
   by the selected D-03 window. Caption: "{closeRate}% of jobs in {window} (period
   snapshot, not a cohort conversion rate)" — this qualifier is mandatory copy per
   Pitfall 4 (`acculynx_job_milestone_history`, the table that would carry true
   transition events, is confirmed live-empty — a cohort-transition rate is not
   computable from live data).
2. **Snapshot close rate** (`computeSnapshotCloseRate()`, new, the user's exact
   formula) — count-based, ignores the time window entirely:

   ```
   (Approved + Invoiced + Closed) / (Leads + Prospects + Approved + Invoiced + Closed)
   ```

   Dead/cancelled already excluded upstream; `completed` counted inside Approved.
   This is a CURRENT SNAPSHOT, not time-windowed. Computed per location and per
   assigned rep, plus an overall (Res/Com split) figure on the KPI card.

# Citations

[1] [Jobs & Pipeline](data/jobs.md) — `acculynx_jobs` / `crm_pipeline` schema detail
[2] [Brain Tables](data/tables.md) — full table/view index
[3] [Account Registry](accounts.md) — the 9-account registry
[4] `.planning/phases/07-executive-sales-pipeline-dashboard/07-RESEARCH.md` — original
    research pass (KPI best-practice sourcing, chart-library audit, live-DB pitfalls)
[5] `.planning/phases/07-executive-sales-pipeline-dashboard/07-UI-SPEC.md` — visual
    contract + the 4 dated checkpoint amendment sections (verbatim user directives)
[6] `.planning/phases/07-executive-sales-pipeline-dashboard/07-01-SUMMARY.md`,
    `07-02-SUMMARY.md` — implementation summaries with live-DB measurements per round
