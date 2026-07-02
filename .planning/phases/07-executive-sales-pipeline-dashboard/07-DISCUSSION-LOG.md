# Phase 7: Executive Sales Pipeline Dashboard - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-01
**Phase:** 7-executive-sales-pipeline-dashboard
**Areas discussed:** Replace semantics & placement, KPI scope & audience, Visualization approach, Freshness & filtering

---

## Replace semantics & placement

| Option | Description | Selected |
|--------|-------------|----------|
| /executive/pipeline (Recommended) | Own page; nav "Weekly Snapshot" → "Sales Pipeline"; keeps DepartmentHome pattern | ✓ |
| /executive becomes the dashboard | Landing page IS the dashboard; breaks DepartmentHome pattern | |
| Both | Dashboard page + KPI strip on overview | |

**User's choice:** /executive/pipeline

| Option | Description | Selected |
|--------|-------------|----------|
| Redirect to new dashboard (Recommended) | 301 → /executive/pipeline; bookmarks keep working | |
| Keep as legacy page | Out of nav, route still works | |
| Delete the route | Remove page + loader; /weekly-snapshot 404s | ✓ |

**User's choice:** Delete the route

| Option | Description | Selected |
|--------|-------------|----------|
| Selectable windows (Recommended) | Time-range selector on window-based KPIs | ✓ |
| Fixed sensible defaults | Each KPI hard-picks its window | |
| Let research decide | Defer to SC1 research | |

**User's choice:** Selectable windows

---

## KPI scope & audience

| Option | Description | Selected |
|--------|-------------|----------|
| PE owners/C-suite | Rollup-first cross-location health | |
| Sales leadership | Operational stage/rep detail up front | |
| Both, exec-first | Exec at-a-glance + drill-down for sales leadership | ✓ |

**User's choice:** Both, exec-first

| Option | Description | Selected |
|--------|-------------|----------|
| Anchor set + research fills (Recommended) | Lock must-haves; research adds/refines | ✓ |
| Research decides everything | No locked KPIs | |
| I'll dictate the full set | User lists exact KPIs | |

**User's choice:** Anchor set + research fills

| Option | Description | Selected |
|--------|-------------|----------|
| Pipeline value by stage | Funnel view cross-location | ✓ |
| Jobs sold + close rate | Sold count/value + conversion | ✓ |
| New leads volume | By location/market and source | ✓ |
| Rep leaderboard + AR | Carried from weekly snapshot | ✓ |

**User's choice:** All four, PLUS (free text): "Breakdown by region, office, commercial/residential, sales team, sales rep (focus on profitability per job then qty of jobs)"

| Option | Description | Selected |
|--------|-------------|----------|
| AccuLynx gross profit (Recommended) | Job-financials worksheet numbers as mirrored | ✓ primary |
| Contract value − invoiced costs | Computed from vendor invoice lines | ✓ fallback |
| Margin % primary | Lead with margin percentage | ✓ presentation |

**User's choice:** "1, if missing 2 and yes to 3" — GP primary, computed fallback, margin-% led.

---

## Visualization approach

| Option | Description | Selected |
|--------|-------------|----------|
| Add a chart library (Recommended) | One lightweight established dep; research picks | ✓ |
| Hand-rolled SVG/CSS | Zero new deps, server-rendered SVG | |
| Hybrid | SVG for simple, lib only if needed | |

**User's choice:** Add a chart library

| Option | Description | Selected |
|--------|-------------|----------|
| To the job list (Recommended) | KPI → filtered job table → AccuLynx link (2 levels) | ✓ |
| KPI → breakdown → jobs | 3 levels | |
| Summary only | No drill-down | |

**User's choice:** To the job list

| Option | Description | Selected |
|--------|-------------|----------|
| Fully responsive (Recommended) | Cards stack, charts resize, tables scroll | ✓ |
| Desktop-first, mobile OK | Boardroom-first | |
| Mobile-first | Phone glanceability primary | |

**User's choice:** Fully responsive

---

## Freshness & filtering

| Option | Description | Selected |
|--------|-------------|----------|
| Load + auto-refresh (Recommended) | SSR live data + silent periodic re-fetch | ✓ |
| Fresh on load only | Manual refresh | |
| Supabase Realtime push | Live subscription (heavy for hourly data) | |

**User's choice:** Load + auto-refresh

| Option | Description | Selected |
|--------|-------------|----------|
| Per-location watermark badge (Recommended) | "Data as of" from real watermarks; flags stale locations | ✓ |
| Simple timestamp | One dashboard-wide timestamp | |
| No indicator | Rely on Phase 3 alerting | |

**User's choice:** Per-location watermark badge

| Option | Description | Selected |
|--------|-------------|----------|
| Global filter bar (Recommended) | One control; everything obeys; default all-rollup | ✓ |
| Per-widget filters | Independent slices per widget | |
| Global + compare mode | Filter bar + side-by-side benchmarking | |

**User's choice:** Global filter bar

---

## Claude's Discretion

- Exact time-window set + default; auto-refresh cadence; staleness styling.
- Dashboard layout/section order (grounded in SC1 research).
- Region + commercial/residential derivation mapping (verify vs live DB).
- Chart library shortlist + final pick (license/provenance sanity).
- Access stays as-is (existing WorkOS gating) unless research says otherwise.

## Deferred Ideas

- Side-by-side office/region compare/benchmark mode (offered in filtering discussion; not v1).
