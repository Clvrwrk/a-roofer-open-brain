# Phase 7: Executive Sales Pipeline Dashboard - Research

**Researched:** 2026-07-01
**Domain:** Executive dashboard UX/KPI design + Astro SSR chart integration + live AccuLynx/ABC financial data verification
**Confidence:** HIGH (live-DB findings, package registry, codebase); MEDIUM (KPI/UX best-practice web research); LOW (none carried into final recommendations without flagging)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Placement & replacement**
- D-01: The dashboard lives at `/executive/pipeline` (the existing `[slug]` stub's default slug). The nav's "Weekly Snapshot" entry under Executive becomes "Sales Pipeline". `/executive` (index) stays the standard DepartmentHome live-work surface — do not break the cross-department pattern.
- D-02: Delete the `/weekly-snapshot` route outright — remove the page and its loader (`weekly-snapshot.astro`, `scripts/weekly-snapshot.ts`, and `lib/weekly-snapshot.ts` once nothing else imports it). No redirect, no legacy page; the route 404s. Anything worth keeping from its sections is absorbed by the new dashboard.
- D-03: Selectable time windows on window-based KPIs (this week / last 7 days / month / quarter — exact set at planner's discretion) so the old weekly ritual survives as one option. Point-in-time KPIs (pipeline value, AR) show current state.

**KPI scope & audience**
- D-04: Audience is both, exec-first: PE owners/C-suite at-a-glance first, with enough drill-down that sales leadership can run with it.
- D-05 (anchor KPIs — LOCKED; research fills/refines but cannot drop):
  1. Pipeline value by stage/milestone (funnel view, cross-location).
  2. Jobs sold + close rate (sold count/value in window; lead→sold conversion).
  3. New leads volume (by location/market and lead source).
  4. Rep leaderboard + AR rollup (carried over from the weekly snapshot).
  5. Breakdowns by region, office, commercial/residential, sales team, sales rep — with PROFITABILITY PER JOB ranked ahead of job quantity (user-added; this is the emphasis).
- D-06 (profitability definition): AccuLynx gross profit (job-financials/worksheet mirror) is the primary profit source; where missing, fall back to contract value − invoiced costs (vendor invoice lines tied to the job); margin % is the lead presentation (dollar profit secondary) so different-sized jobs compare fairly. Research/planning MUST verify field coverage per location before committing to the exact computation (live-DB verification, not migration files).
- D-07: SC1 research (Firecrawl/Exa/Tavily per ROADMAP) produces the dashboard spec: it refines KPI presentation, adds researched C-suite KPIs beyond the anchors, and picks the chart library (D-08). The spec lands in the OKF bundle (ROADMAP SC3 for Phase 6 already names a "dashboard spec" as an OKF artifact).

**Visualization**
- D-08: Add ONE lightweight, well-established chart library (the app currently has zero charting deps). Research picks the specific library (ECharts/Chart.js class; license/provenance review per repo culture); planner wires it into the Astro/vanilla-TS stack. No heavyweight framework adoption (no React just for charts).
- D-09: Drill-down is two levels: click any KPI/chart segment → filtered job-level table in-dashboard (pattern precedent: the snapshot's drill-down record tables) → each row links out to the job in AccuLynx. No intermediate breakdown pages.
- D-10: Fully responsive — KPI cards stack, charts resize, tables scroll on mobile. One codebase; executives will check this from phones.

**Freshness & filtering**
- D-11: Server-render live DB data on load + silent client auto-refresh every few minutes (exact cadence planner's discretion) so a left-open tab stays current. No Supabase Realtime push — the data only changes hourly via the cron.
- D-12: Per-location freshness badges driven by the real ingestion watermarks / cron outcomes (`acculynx_sync_watermarks`, `v_acculynx_cron_outcomes`): "data as of" per location, visibly flagged when any location is stale beyond the hourly SLA. Honest, not cosmetic.
- D-13: Global filter bar (location/office, region, commercial vs residential) at the top; every KPI, chart, and drill-down obeys it. Default = all locations rolled up.

### Claude's Discretion
- Exact time-window set and default window (D-03), auto-refresh cadence (D-11), staleness threshold styling (D-12).
- Dashboard layout/section ordering — grounded in the SC1 research.
- How region and commercial/residential are derived (account registry `market`/program fields vs job attributes) — verify against the live DB; document the mapping in the spec.
- The chart library shortlist and final pick (D-08), subject to license/provenance sanity.
- Access: keep the existing WorkOS gating as-is (viewer domains/roles unchanged) unless research surfaces a reason to restrict further.

### Deferred Ideas (OUT OF SCOPE)
- Side-by-side office/region compare mode — offered during filtering discussion; user chose the plain global filter bar for v1. A compare/benchmark view could be a future enhancement.
- (Carried from earlier phases, unrelated to this one: ob-acculynx Slack provisioning lives in the separate Slack project; first live prod payment write deferred until a real need.)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REQ-10 | A realtime Executive Sales Pipeline dashboard under the Executive tab of cc.proexteriorsus.net, replacing the weekly snapshot, built to researched C-suite best practices and KPIs. | Dashboard Spec section (KPI formulas + layout), Chart Library pick, Live-DB verification of financial/region/commercial-residential field coverage, Freshness Architecture section, Deploy Gate reuse of the existing Coolify skill. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **No destructive SQL.** This phase is additive: it reads existing tables/views, adds no new columns for MVP (financial fallback computation happens in the loader, not a migration). If a `v_executive_pipeline_dashboard`-style helper view is added, it must be `CREATE OR REPLACE VIEW` / `CREATE ... IF NOT EXISTS`.
- **No secrets in code.** Chart library install adds zero new secrets. All Supabase access continues through `createServerSupabaseClient` reading `RuntimeEnv`.
- **MCPs are MCP containers only.** N/A — no MCP servers touched by this phase.
- **Trust-tier discipline.** No new atoms are written; this phase only reads/aggregates. If any derived rollup gets persisted (e.g., a cached daily profit-by-region snapshot table), default trust_tier is `evidence`.
- **Security boundary.** Dashboard reads only from the client's own Supabase project (already the Command Center's data plane) — no Historian/Researcher boundary crossing.
- **Property-first / era-aware.** N/A directly — this phase aggregates job/financial data, not property atoms. If profitability rollups are later atomized, they must carry `property_id` and `era_of_practice` per hard rules 7–8, but that is out of scope for a dashboard-only phase.
- **10x ROI gate.** REQ-10 already has an approved phase in ROADMAP.md — no new A3 required (this replaces net capability the business already runs weekly by hand, at exec-visibility scale).
- **No profanity / clean content.** N/A, applies to copy in the dashboard UI.
- **Live ⇄ Dev alignment.** Confirm `main` is the deploying branch and current before starting (Coolify app `command-center` deploys from `main` — confirmed in `.claude/skills/coolify/SKILL.md`). Branch from `main`, converge back into `main`, push, poll `/healthz` `buildCommit`.
- **Third-party agent tool gate (hard rule 12).** Does not apply — the chart library is a client-rendering dependency, not an agent/skill/MCP tool. Standard package-legitimacy review (this document's audit table) is the correct and sufficient gate.

## Summary

The weekly-snapshot loader (`app/command-center/src/lib/weekly-snapshot.ts`) already proves every pipeline-facing query shape the new dashboard needs (milestone, salesperson, contract/estimate amounts, balance due, lead/approved dates, market, insurance fields) — the new dashboard's data layer is an evolution of this file, not a new design. The two things that are genuinely new are (1) profitability-per-job by region/office/commercial-residential/rep, and (2) a real chart library, since the app has zero charting dependencies today.

Live-DB verification is decisive for D-06: **AccuLynx job-financials coverage is 0% live** — `acculynx_job_financials` holds exactly one row, and it is archived sandbox test data (`account_key='sandbox'`, `archived_at` set, `archive_reason: phase3-legacy-null-provenance-triage`). The primary GP source in the locked decision does not exist in production yet. The fallback (contract value − invoiced costs via ABC vendor invoice lines) is the ONLY currently-viable profit signal, but its own AccuLynx-job linkage is thin: only 151 of 995 ABC invoices (~15%) resolve to an `acculynx_job_id` via `v_invoice_acculynx_match`. This means margin % can only be computed, at go-live, for the minority of jobs where a vendor invoice has been matched to a job — the dashboard must show margin cards as "N of M jobs have cost data" rather than presenting 100% coverage. Region/commercial-residential derivation is also non-trivial: `crm_pipeline` (the pipeline consumer table) has no `account_key` column and a `market` field that is a granular county slug (e.g. `sedgwick_ks`, `collin_tx`), not the 8 production locations; the join to true location/account must go through `acculynx_jobs.account_key` via `acculynx_job_id`. Commercial/residential must come from `acculynx_jobs.job_category_name` (Residential/Commercial/Property Management), which is null for ~33% of rows — present as "uncategorized" rather than dropping those jobs.

For the chart library, live registry checks confirm Chart.js (MIT, v4.5.1, chartjs/Chart.js on GitHub, no postinstall script) is the correct pick over Apache ECharts (heavier, ~300KB, more than this app needs) and uPlot (smallest at ~48KB but architecturally time-series-only — no native funnel/categorical-bar support, which breaks the D-05 anchor #1 funnel requirement). Chart.js ships bar, doughnut/pie (usable as a funnel proxy via stacked horizontal bars), and line/sparkline out of the box, has a huge ecosystem (`chartjs-plugin-*`), and mounts cleanly as a vanilla-JS client script with no framework — a direct fit for D-08's "no heavyweight framework" constraint and this repo's Astro-SSR-plus-vanilla-TS-client-script pattern (already proven by `scripts/weekly-snapshot.ts`).

**Primary recommendation:** Build the new dashboard as a fresh `executive/pipeline.astro` (replacing the `[slug].astro` stub's default route) with a loader `lib/executive-pipeline.ts` that starts from `weekly-snapshot.ts`'s proven query shapes, joins `crm_pipeline` ⟷ `acculynx_jobs` (via `acculynx_job_id`) to get `account_key`/`job_category_name`, computes margin % via the documented fallback chain with explicit coverage badges, and renders with Chart.js mounted from a vanilla `scripts/executive-pipeline.ts` client script — paginating every Supabase query with `.range()` to avoid the PostgREST 1000-row cap that silently truncated an early verification query in this research pass.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| KPI aggregation (pipeline value, close rate, margin %, leaderboard) | Frontend Server (SSR) | Database | Astro server-rendered loader (`lib/executive-pipeline.ts`) queries Supabase directly server-side, same pattern as `weekly-snapshot.ts` and `live-work.ts`; no API/backend tier exists separately from the Astro SSR process in this app. |
| Chart rendering (funnel, bar, line, sparkline) | Browser / Client | — | Chart.js renders to `<canvas>` client-side; data is serialized into the page as JSON and hydrated by a vanilla `<script>`, matching the existing `weekly-snapshot.ts` drill-down pattern — no SSR-side chart rendering. |
| Global filter bar (location/region/commercial-residential) | Browser / Client | Frontend Server (SSR) | Initial filter state can be seeded server-side from query params (SSR-friendly first paint), but filter changes re-render client-side against pre-fetched or re-fetched JSON — avoids full-page reloads per D-11's "silent auto-refresh" spirit. |
| Freshness badges (per-location "data as of") | Frontend Server (SSR) | Database | Read directly from `acculynx_sync_watermark` + `v_acculynx_cron_outcomes` at SSR time — same as any other live metric; no separate service needed. |
| Auto-refresh (silent poll) | Browser / Client | — | A client-side `setInterval` re-fetches a JSON endpoint (or re-runs the SSR loader via a lightweight `/api/executive/pipeline.json` route) — Astro SSR pages don't have built-in polling; this must be a small API route + client fetch, not a full page reload. |
| Drill-down job table + AccuLynx deep link | Browser / Client | Database | Same client-side drilldown-table swap pattern as `scripts/weekly-snapshot.ts` — records pre-serialized into `data-records` JSON attributes, no additional round-trip needed for the two-level D-09 drill-down. |
| Deploy / verification | CDN / Static (build) | — | Standard Coolify build of the Astro Docker image; no new infra. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| chart.js | 4.5.1 (verified via `npm view`, published 2025-10-13) | Bar/doughnut/line/sparkline rendering for pipeline funnel, leaderboard, margin trends | Long-established (2013+), MIT, largest ecosystem of any lightweight canvas charting lib, mounts framework-free exactly like this repo's existing vanilla client scripts `[VERIFIED: npm registry]` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none required) | — | — | Chart.js alone covers every D-05 chart need (funnel via stacked horizontal bar, leaderboard via bar, trend via line, sparkline via minimal line). Do not add a funnel-specific plugin (`chartjs-chart-funnel`) unless the plain stacked-bar funnel proxy proves visually insufficient in implementation — keep the dependency count at exactly one per D-08. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Chart.js | Apache ECharts (6.1.0, Apache-2.0) | More chart types (true funnel, sankey, treemap) and better huge-dataset perf, but ~300KB even tree-shaken vs. Chart.js's ~60-110KB — disproportionate for a dashboard with dozens of KPI series, not millions of points `[VERIFIED: npm registry]` |
| Chart.js | uPlot (1.6.32, MIT) | Smallest bundle (~48KB) and fastest for large time-series, but architecturally time-series-only (numeric, increasing, unique X values) — no native categorical/funnel support, which breaks D-05 anchor #1 (funnel view) without hand-rolled canvas work `[CITED: github.com/leeoniya/uPlot issue #9 — category x-axis requested, not native]` |

**Installation:**
```bash
cd app/command-center
npm install chart.js@4.5.1
```

**Version verification:** confirmed live via `npm view chart.js version` → `4.5.1`, `npm view chart.js license` → `MIT`, `npm view chart.js repository.url` → `git+https://github.com/chartjs/Chart.js.git`, `npm view chart.js scripts.postinstall` → empty (no postinstall script). `[VERIFIED: npm registry]`

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| chart.js | npm | 12+ years (est. from Chart.js project history; first npm publish predates 2015) | Tens of millions/week (widely known, not independently re-verified this session) | github.com/chartjs/Chart.js | OK | Approved |
| echarts (considered, not adopted) | npm | 10+ years, Apache Software Foundation project | Millions/week (widely known) | github.com/apache/echarts | OK | Not selected (bundle size) |
| uplot (considered, not adopted) | npm | 7+ years | Smaller but established, single well-known maintainer (leeoniya) | github.com/leeoniya/uPlot | OK | Not selected (no funnel/categorical support) |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

All three candidates are long-established, widely-known open-source projects independently confirmed via `npm view` (version, license, repository URL, no postinstall script). Age/downloads for echarts/uplot are `[ASSUMED]` from training knowledge (not independently re-queried this session beyond registry existence); chart.js's registry facts (version, license, repo, publish date, postinstall) are `[VERIFIED: npm registry]`. None show slopsquat signals (no generic/typo-adjacent name, active canonical GitHub org, long publish history).

## Architecture Patterns

### System Architecture Diagram

```
Browser (executive, phone or desktop)
   │
   │  GET /executive/pipeline?window=week&location=all&type=residential
   ▼
Astro SSR page (executive/pipeline.astro)
   │
   │  await loadExecutivePipelineDashboard(filters)      ← new loader, lib/executive-pipeline.ts
   ▼
createServerSupabaseClient(env)  ──────────────────────────────────────────┐
   │                                                                       │
   ├─▶ crm_pipeline (milestone, rep, amounts, dates, market)               │  Supabase
   ├─▶ acculynx_jobs (account_key, job_category_name, trade_types)         │  (rnhmvcpsvtqjlffpsayu)
   │      join on acculynx_job_id  ──▶ derives region + commercial/resid. │
   ├─▶ acculynx_job_financials (gross-profit fields — 0% live coverage)    │
   ├─▶ v_invoice_acculynx_match / abc_invoice_lines (fallback cost path)   │
   ├─▶ acculynx_sync_watermark + v_acculynx_cron_outcomes (freshness)      │
   └─▶ acculynx_accounts (account registry — label/state/program)         │
                                                                            └─
   │
   │  Aggregated dashboard JSON: KPI cards, funnel data, leaderboard rows,
   │  margin-by-dimension rows (with coverage %), freshness badges
   ▼
Astro renders initial HTML (SSR first paint) + embeds JSON as
  <script type="application/json" id="dashboard-data">…</script>
   │
   ▼
Client script (scripts/executive-pipeline.ts)
   ├─▶ mounts Chart.js canvases (funnel/bar/line) from the embedded JSON
   ├─▶ wires the global filter bar → re-fetch from /api/executive/pipeline.json
   ├─▶ wires two-level drill-down (KPI/chart segment → job table → AccuLynx href)
   └─▶ setInterval poll (silent auto-refresh) → re-fetch JSON, re-render in place
   │
   ▼
Links out: https://[company].acculynx.com/jobs/{acculynx_job_id}  (existing pattern)
```

### Recommended Project Structure
```
app/command-center/src/
├── pages/
│   └── executive/
│       ├── pipeline.astro          # NEW — replaces [slug].astro's default route (D-01)
│       └── [slug].astro            # keep for any other executive sub-slugs, or remove if pipeline is the only slug
├── pages/api/executive/
│   └── pipeline.json.ts            # NEW — JSON endpoint for client-side filter changes + auto-refresh poll
├── lib/
│   ├── executive-pipeline.ts       # NEW — loader; supersedes weekly-snapshot.ts's pipeline logic
│   └── weekly-snapshot.ts          # DELETE per D-02 once nothing imports it
├── scripts/
│   ├── executive-pipeline.ts       # NEW — Chart.js mounting + filter bar + drilldown + auto-refresh
│   └── weekly-snapshot.ts          # DELETE per D-02
└── components/
    └── (optional) ExecutivePipelineDashboard.astro  # if the page grows past a comfortable single-file size
```

### Pattern 1: SSR-first-paint + client-JSON-hydration (already proven in this repo)
**What:** The Astro page runs the loader server-side for the first paint (fast, no loading spinner, works with JS disabled for the initial view), then re-hydrates interactivity from a `<script type="application/json">` blob the client script parses — exactly what `weekly-snapshot.astro` + `scripts/weekly-snapshot.ts` already do via `data-records` JSON attributes on trigger elements.
**When to use:** Any Astro page needing both fast SSR and rich client interactivity without a UI framework.
**Example:**
```typescript
// Source: app/command-center/src/scripts/weekly-snapshot.ts (existing pattern to extend)
function parseRecords(trigger: HTMLElement): DashboardRecord[] {
  try {
    const records = JSON.parse(trigger.dataset.records ?? "[]") as DashboardRecord[];
    return Array.isArray(records) ? records : [];
  } catch {
    return [];
  }
}
```

### Pattern 2: Chart.js mount from vanilla TS (no framework)
**What:** Chart.js exposes `new Chart(ctx, config)` against a plain `<canvas>` element — no JSX, no component tree required.
**When to use:** Every chart in this dashboard (funnel-proxy stacked bar, rep leaderboard bar, trend line).
**Example:**
```typescript
// Source: Chart.js official docs (https://www.chartjs.org/docs/latest/getting-started/) — general API shape, adapt for this app
import { Chart, BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from "chart.js";
Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

const ctx = document.getElementById("pipeline-funnel") as HTMLCanvasElement;
new Chart(ctx, {
  type: "bar",
  data: {
    labels: ["Lead", "Prospect", "Approved", "Completed", "Invoiced"],
    datasets: [{ label: "Pipeline value by stage", data: stageValues }],
  },
  options: { indexAxis: "y", responsive: true, maintainAspectRatio: false },
});
```
Note: register only the controllers/elements actually used (tree-shakeable API) to keep the bundle close to Chart.js's minimal ~60KB footprint rather than the full ~110KB build.

### Pattern 3: PostgREST pagination via `.range()` (mandatory, proven pitfall in this exact research session)
**What:** Every Supabase/PostgREST query defaults to a 1000-row cap. `weekly-snapshot.ts`'s `selectAll()` helper already implements the correct loop.
**When to use:** ANY query against `crm_pipeline` (7,053 rows), `acculynx_jobs` (6,434 rows), or `abc_invoices` (995 rows) that needs the FULL table, not a capped sample.
**Example:**
```typescript
// Source: app/command-center/src/lib/weekly-snapshot.ts:260-281 (existing, proven helper — reuse directly)
async function selectAll<T>(client: SupabaseClient, table: string, columns: string, query?: (b: any) => any): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  for (;;) {
    const to = from + 1000 - 1;
    let builder = client.from(table).select(columns).range(from, to);
    if (query) builder = query(builder);
    const { data, error } = await builder;
    if (error) throw new Error(`${table}: ${error.message || error.code || "query failed"}`);
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < 1000) return rows;
    from += batch.length;
  }
}
```
**Verified this session:** an unpaginated `acculynx_jobs?select=account_key&limit=7000` query silently returned only 1000 rows (all `colorado`), producing a completely wrong account distribution, until re-run with explicit `Range` headers across pages — confirming this is a live, current-session pitfall, not a theoretical one.

### Pattern 4: Margin-% coverage badge (new pattern this phase must introduce)
**What:** Because job-financials (AccuLynx GP) coverage is 0% and the invoice-line fallback only resolves ~15% of vendor invoices to a job, every margin-% KPI/chart segment must carry an explicit "N of M jobs have cost data" caption — never silently average over the ~85% with no cost data as if margin were unknown-but-zero.
**When to use:** Every profitability-per-job breakdown (region, office, commercial/residential, sales team, rep).
**Example:**
```typescript
interface MarginCoverage {
  jobsWithCostData: number;
  totalJobsInSlice: number;
  coveragePct: number; // jobsWithCostData / totalJobsInSlice
}
// Render: "Margin 22% avg (18 of 130 jobs have cost data — 14% coverage)"
```

### Anti-Patterns to Avoid
- **Presenting margin % as if fully covered:** silently excluding jobs with no cost data from a margin average, without surfacing the exclusion, misleads the exact audience (PE owners) this phase exists to inform honestly.
- **Vanity metrics without denominators:** e.g. "1,284 jobs synced" alone is not a KPI — always pair counts with a rate, target, or prior-period comparison per the 40-30-20-10 space rule researched below.
- **Chart junk / 3D or excessive color:** avoid 3D bar/pie effects, gratuitous gradients, or more than ~6-8 colors in a single chart — reduces scan speed for the primary "5-second comprehension" executive use case.
- **Full-page reload on filter change:** breaks D-11's "silent" auto-refresh intent; filter changes and the periodic poll must both update in place via the JSON endpoint.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Funnel/bar/line/sparkline rendering | Custom `<canvas>` drawing code | Chart.js | Canvas math (scaling, hit-testing, responsive resize, accessibility labels) is exactly the kind of deceptively complex problem this app has correctly avoided so far (zero chart deps) — don't start now. |
| Pagination past PostgREST's 1000-row cap | A one-off `limit=7000` query (looks like it works, silently truncates) | The existing `selectAll()` `.range()` loop from `weekly-snapshot.ts` | Proven this session: an unpaginated query returned a completely wrong single-account result set with no error. |
| Milestone-to-milestone conversion / close rate | A custom event-log join against `acculynx_job_milestone_history` | Current-milestone + date-field windowing (same approach `weekly-snapshot.ts` already uses: `soldMilestones` set + `inWindow(approved_date ?? milestone_date ?? updated_at, …)`) | `acculynx_job_milestone_history` is NOT YET INGESTED (confirmed live: zero rows, `content-range: */0`) — a true transition-based close rate is not computable from live data yet; the snapshot-based proxy is the only viable option for this phase. |

**Key insight:** every "don't hand-roll" item here maps to a capability the codebase already solved correctly (charting avoidance, pagination helper, milestone-snapshot proxy) — the discipline for this phase is to extend those solved patterns, not reinvent them under dashboard-specific pressure.

## Runtime State Inventory

Not applicable — this is a net-new dashboard page replacing an existing page (D-02 delete), not a rename/refactor/migration of an identifier across systems. No stored-data keys, OS registrations, or secret names change. Confirmed explicitly:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — no table/column is renamed; `weekly-snapshot.ts`'s query shapes are being extended in a new file, not mutated in place. | None |
| Live service config | None — no n8n/Datadog/Tailscale/Cloudflare config references "weekly-snapshot" by name outside this repo. | None |
| OS-registered state | None — no cron/task/pm2 process references the weekly-snapshot route. | None |
| Secrets/env vars | None — no env var name changes; Supabase creds are reused as-is. | None |
| Build artifacts | None — deleting `weekly-snapshot.astro` + its `.ts` files removes them from the next Astro build; no stale egg-info/dist artifact class applies to this Node/Astro app. | Standard `npm run build` after deletion confirms no dangling import errors. |

## Common Pitfalls

### Pitfall 1: Trusting `acculynx_job_financials` as populated (it isn't, live)
**What goes wrong:** Building the dashboard's primary margin computation against `acculynx_job_financials` assuming REQ-04's "job financials" ingestion (PROJECT.md, marked Active/unchecked) has landed data.
**Why it happens:** The OKF docs (`data/tables.md`) mark the table `⏳ Phase 2` (not yet fed) but a planner skimming table names could assume "Phase 2" already ran given the milestone's progress.
**How to avoid:** Verified live this session — `acculynx_job_financials` has exactly 1 row, and it is archived (`archived_at` set, `trust_tier: evidence`, `account_key: sandbox`). Build the primary computation as "try job-financials row, fall back to invoice-line-derived cost, else `null` with an explicit 'no cost data' badge" — never assume the primary path returns data for a normal production job.
**Warning signs:** A margin-% KPI showing suspiciously round or uniform numbers across most jobs (would indicate a fallback silently defaulting to 0 cost, i.e., 100% margin — a dangerous false signal to show a PE owner).

### Pitfall 2: `crm_pipeline.market` is not the location/account dimension
**What goes wrong:** Using `crm_pipeline.market` directly as the "region/office" filter dimension for D-13, assuming it maps 1:1 to the 8 `acculynx_accounts` locations.
**Why it happens:** `market` looks like a location field and IS present directly on `crm_pipeline` (no join needed), which is tempting for a quick implementation.
**How to avoid:** Verified live — `crm_pipeline.market` values are granular county/metro slugs (`sedgwick_ks`, `collin_tx`, `denver_co`, `atlanta_ga`, `mo_other`, etc.), not the 8 account_keys (`colorado`, `florida`, `georgia`, `kansas_city`, `texas`, `wichita`, `insurance_program`, `multi_family_commercial`). The correct region/office dimension requires joining `crm_pipeline.acculynx_job_id` → `acculynx_jobs.id` to read `acculynx_jobs.account_key` (verified populated for all 6,434 rows across all 8 production accounts, zero bleed per the runbook's 2026-07-01 expansion note). Document this join explicitly in the dashboard spec artifact per the "Claude's Discretion" note in CONTEXT.md.
**Warning signs:** A location filter dropdown with dozens of granular market-slug options instead of the expected 8 clean location names.

### Pitfall 3: PostgREST 1000-row cap silently truncating aggregate queries
**What goes wrong:** Any unpaginated `select=...&limit=N` query against a table with >1000 rows (`crm_pipeline` 7,053, `acculynx_jobs` 6,434) silently returns only the first 1000 rows in primary-key order — with NO error, making aggregates (counts, sums, distinct groupings) subtly wrong rather than obviously broken.
**Why it happens:** Reproduced live in this exact research session: `acculynx_jobs?select=account_key&limit=7000` returned exactly 1000 rows, all `account_key: colorado` (the lexically/insertion-order-first account), making it look like only one location has data.
**How to avoid:** Reuse the `selectAll()` `.range()`-looping helper (already proven in `weekly-snapshot.ts`) for every full-table aggregate query in the new loader. Never trust a single `limit=N` call for N > 1000.
**Warning signs:** Any KPI or breakdown that shows suspiciously single-valued dimensions (e.g., "all jobs are in one location") when the business is known to be multi-location.

### Pitfall 4: Close rate computed as a true funnel-transition rate (data doesn't support it yet)
**What goes wrong:** Presenting "close rate" as a rigorous cohort conversion (X% of leads created in period P eventually became sold, tracked via milestone transition timestamps).
**Why it happens:** `acculynx_job_milestone_history` — the table that would carry actual transition events — is confirmed live-empty (`content-range: */0`); the data doesn't exist yet to compute a transition-based rate.
**How to avoid:** Use the same snapshot-based approach `weekly-snapshot.ts` already uses: count of sold-milestone rows in the window ÷ count of lead-milestone rows in the window (both filtered by their respective date fields), and label it clearly as a period-snapshot ratio, not a cohort conversion rate, in the KPI caption.
**Warning signs:** A close-rate percentage presented without any qualifying caption, inviting the reader to assume cohort-level rigor that the underlying data can't support.

### Pitfall 5: Milestone value casing mismatch between `acculynx_jobs` and `crm_pipeline`
**What goes wrong:** `acculynx_jobs.current_milestone` uses Title Case (`Lead`, `Approved`, `Cancelled`, `Completed`, `Invoiced`, `Closed`, `Prospect`) while `crm_pipeline.current_milestone` uses lowercase snake-ish values (`unassigned_lead`, `assigned_lead`, `prospect`, `approved`, `completed`, `invoiced`, `closed`, `cancelled`, `dead`). A join or a shared milestone-set filter that doesn't normalize casing/vocabulary will silently drop rows.
**Why it happens:** These are two independently-evolved mirror tables (`acculynx_jobs` closer to the raw API shape, `crm_pipeline` the normalized consumer table) that were never required to share an enum.
**How to avoid:** Always filter/group by `crm_pipeline.current_milestone` (the normalized, already-lowercased values `weekly-snapshot.ts` uses) for pipeline-stage logic; only use `acculynx_jobs` for the account_key/job_category_name join, never for milestone comparisons.
**Warning signs:** A funnel chart showing zero jobs in a stage everyone knows is populated.

### Pitfall 6: Chart.js SSR/hydration mismatch in an Astro page with no client framework
**What goes wrong:** Attempting to construct a `Chart` instance during Astro's server render (inside frontmatter) instead of purely client-side — Chart.js requires a real `<canvas>` DOM element and browser APIs (ResizeObserver, etc.) that don't exist during SSR.
**Why it happens:** Astro's `output: "server"` mode makes it tempting to do "everything" in the frontmatter script block, but chart mounting is inherently a client concern.
**How to avoid:** Follow the existing repo pattern exactly — the Astro frontmatter only computes/serializes data; a separate `<script src="/src/scripts/executive-pipeline.ts">` (loaded as a native ES module, the same way `weekly-snapshot.astro` loads `scripts/weekly-snapshot.ts`) does all `new Chart(...)` calls after `DOMContentLoaded`/module-load time, reading the pre-serialized JSON.
**Warning signs:** Astro build errors referencing `document is not defined` or `ResizeObserver is not defined` during `astro build`.

## Code Examples

### PostgREST pagination (verified pattern, reused from this repo)
```typescript
// Source: app/command-center/src/lib/weekly-snapshot.ts (existing, in-repo, already proven)
async function selectAll<T>(client: SupabaseClient, table: string, columns: string, query?: (b: any) => any): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  for (;;) {
    const to = from + 1000 - 1;
    let builder = client.from(table).select(columns).range(from, to);
    if (query) builder = query(builder);
    const { data, error } = await builder;
    if (error) throw new Error(`${table}: ${error.message || error.code || "query failed"}`);
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < 1000) return rows;
    from += batch.length;
  }
}
```

### Chart.js tree-shaken registration (minimizes bundle vs. full `import "chart.js/auto"`)
```typescript
// Source: Chart.js official docs (https://www.chartjs.org/docs/latest/getting-started/integration.html) — adapt import list to charts actually used
import {
  Chart,
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from "chart.js";

Chart.register(BarController, BarElement, LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Weekly manual snapshot email/page (`weekly-snapshot.astro`) reviewed on a 2-week rolling window | Realtime, filterable, drill-down dashboard under `/executive/pipeline` reflecting all 8 locations hourly | This phase (2026-07) | Replaces a periodic, single-window, single-office-blind snapshot with an always-current, location-filterable, margin-aware view — directly closes REQ-10. |
| Single-location (`kansas_city`-only) job mirror, ~99% of `acculynx_jobs` | Full 8-account coverage confirmed live this session (colorado 1843, texas 2299, wichita 1284, kansas_city 166, georgia 435, multi_family_commercial 352, insurance_program 25, florida 30 — total 6,434) | Phase 2/3 of this milestone (2026-06 → 2026-07-01, per runbook's "6-account expansion" note) | The dashboard's "all 8 location accounts, filterable" success criterion (SC3) is now genuinely supportable by live data — this was NOT true even a few days before this research pass. |

**Deprecated/outdated:**
- The weekly-snapshot page and its loader are being retired outright per D-02 — no redirect, no legacy support window.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Chart.js's stacked-horizontal-bar can adequately proxy a "funnel view" for D-05 anchor #1 without a dedicated funnel plugin. | Standard Stack / Architecture Patterns | If the visual isn't convincing to Chris/PE owners, the planner may need to add `chartjs-chart-funnel` (npm, MIT, existence-verified this session but not deeply vetted) as a second dependency — still within D-08's "one lightweight library" spirit if kept minimal. |
| A2 | Downloads/community-size figures for echarts and uplot (cited in the Package Legitimacy Audit as "millions/week" and "established, single well-known maintainer") are training-knowledge estimates, not independently re-verified via a downloads API this session. | Package Legitimacy Audit | Low risk — these two libraries were NOT selected; the claim only supports the comparative rationale for picking Chart.js, not a live production dependency. |
| A3 | Chart.js bundle-size figures (~60-110KB, ~25-35KB tree-shaken) and ECharts (~300KB)/uPlot (~48KB) come from a WebSearch summary of third-party blog comparisons, not a direct build-and-measure in this repo. | Standard Stack / Alternatives Considered | If the actual tree-shaken bundle in THIS app's build is meaningfully larger, it doesn't change the funnel-support disqualification of uPlot or the recommendation of Chart.js over ECharts, but the planner should run an actual `astro build` size check once the dependency is wired in. |
| A4 | The general executive-dashboard UX best practices (F-pattern scanning, 40-30-20-10 space rule, 5-9 KPI working-memory limit, 5-second comprehension target) are drawn from general BI/dashboard-design sources (Klipfolio, UXPin, DataCamp, etc.), not roofing- or construction-specific primary research. | Common Pitfalls / Architecture Patterns / Dashboard Spec | Low-medium risk — these are widely-corroborated general UX findings, not domain-specific claims about roofing KPIs; the roofing-specific KPI substance (gross margin, bid-to-award, job margin gain/fade) came from a separate roofing/construction-specific search pass and is treated as MEDIUM confidence, cited below. |

**If this table is empty:** N/A — see rows above.

## Open Questions

1. **Should the margin fallback (contract − invoiced cost) be computed at query time in the loader, or backed by a new SQL view?**
   - What we know: The join chain is `crm_pipeline.acculynx_job_id → acculynx_jobs.id/account_key`, plus `v_invoice_acculynx_match` for job↔invoice linkage, plus `abc_invoice_lines` for line-level cost detail.
   - What's unclear: Whether a `CREATE OR REPLACE VIEW v_job_margin_estimate` (additive, hard-rule-1-compliant) is worth adding now vs. computing entirely in TypeScript for a v1 dashboard.
   - Recommendation: Start with a TypeScript computation in the loader (faster to iterate, no migration risk) for v1; revisit a materialized/regular view only if the query becomes a measurable perf bottleneck (unlikely at ~7K/6K row scale).

2. **What exact set of time windows should D-03 offer?**
   - What we know: The old weekly-snapshot used a fixed 14-day rolling window. CONTEXT.md leaves the exact set at the planner's discretion (e.g., this week / last 7 days / month / quarter).
   - What's unclear: Whether PE ownership has an existing reporting cadence (monthly board deck, quarterly ownership call) that should dictate the default window.
   - Recommendation: Default to "last 7 days" (closest analog to the retired weekly ritual) with This Week / Last 7 Days / Month-to-Date / Quarter-to-Date as the selectable set; point-in-time KPIs (pipeline value, AR) ignore the window per D-03.

3. **Should the "Insurance Program" and "Multi-Family/Commercial" AccuLynx accounts be treated as locations (for the location filter) or as a cross-cutting program dimension alongside geographic locations?**
   - What we know: `acculynx_accounts.program` is populated for exactly these two accounts (`"Insurance Program"`, `"Multi-Family Commercial"`) and null for the 6 geographic accounts.
   - What's unclear: Whether PE ownership conceptually treats these as an 8th/9th "location" in the filter bar or as an orthogonal program flag layered on top of the 6 geographic offices.
   - Recommendation: Treat all 8 as peer entries in the location/office filter for v1 (simplest, matches D-13's plain "global filter bar" choice over the deferred compare-mode), but note the program vs. geography distinction in the dashboard spec artifact so a future phase can split them if requested.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js / npm | Build + chart.js install | ✓ | (repo-standard; `npm view` calls succeeded) | — |
| Supabase project `rnhmvcpsvtqjlffpsayu` (PostgREST) | All live-data queries | ✓ (verified live via curl this session) | — | — |
| `.env` root file with `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Live-DB verification queries in this research pass and in the app's server runtime | ✓ (sourced successfully; matches the documented CONTEXT.md read pattern) | — | — |
| Coolify deploy host (`cc.proexteriorsus.net`) | SC4 deploy + healthz verify | Not re-probed this session (network egress to Coolify not exercised); assumed available per `.claude/skills/coolify/SKILL.md` | — | Standard Coolify redeploy + `/healthz` `buildCommit` poll per the skill |

**Missing dependencies with no fallback:** none identified.
**Missing dependencies with fallback:** none identified — Coolify availability was not re-probed live this session (out of scope for research; will be exercised at actual deploy time per the skill's documented API cookbook).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (devDependency, confirmed `npx vitest run` → 17 test files, 98 tests, all passing, 477ms) |
| Config file | `app/command-center/vitest.config.ts` |
| Quick run command | `cd app/command-center && npx vitest run src/lib/executive-pipeline.test.ts` (new file, Wave 0 gap — see below) |
| Full suite command | `cd app/command-center && npm test` (currently `vitest run`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REQ-10 | Pipeline-value-by-stage funnel data groups `crm_pipeline` rows correctly by normalized (lowercase) milestone | unit | `npx vitest run src/lib/executive-pipeline.test.ts -t "funnel"` | ❌ Wave 0 |
| REQ-10 | Close-rate / jobs-sold computation uses snapshot-window logic (not milestone-history) and matches the `weekly-snapshot.ts` precedent's sold/lead milestone sets | unit | `npx vitest run src/lib/executive-pipeline.test.ts -t "close rate"` | ❌ Wave 0 |
| REQ-10 | Margin-% computation prefers job-financials, falls back to contract−invoiced-cost, and reports explicit coverage (N of M) rather than silently defaulting missing cost data to 0 | unit | `npx vitest run src/lib/executive-pipeline.test.ts -t "margin"` | ❌ Wave 0 |
| REQ-10 | Region/office derivation joins `acculynx_jobs.account_key` correctly and does NOT use `crm_pipeline.market` as the location dimension | unit | `npx vitest run src/lib/executive-pipeline.test.ts -t "region"` | ❌ Wave 0 |
| REQ-10 | `selectAll()`-style pagination is used for every full-table query in the new loader (regression guard against the 1000-row silent-truncation pitfall) | unit | `npx vitest run src/lib/executive-pipeline.test.ts -t "pagination"` | ❌ Wave 0 |
| REQ-10 | Freshness badges correctly flag a location stale when `acculynx_sync_watermark.last_sync_at` exceeds the hourly SLA | unit | `npx vitest run src/lib/executive-pipeline.test.ts -t "freshness"` | ❌ Wave 0 |
| REQ-10 | `/weekly-snapshot` route 404s post-deletion and nothing imports the deleted loader/scripts | smoke | `npm run build` (Astro build fails on dangling imports) + a manual `curl -I https://cc.proexteriorsus.net/weekly-snapshot` post-deploy expecting 404 | ❌ Wave 0 (build-time check exists implicitly via `astro build`, but no explicit test asserts the route is gone) |
| REQ-10 | Deploy gate: `buildCommit` on `/healthz` flips to the pushed SHA | manual-only (justification: requires live Coolify deploy, cannot be simulated in Vitest) | `curl -s https://cc.proexteriorsus.net/healthz \| jq .buildCommit` per the coolify skill | N/A |

### Sampling Rate
- **Per task commit:** `cd app/command-center && npx vitest run src/lib/executive-pipeline.test.ts`
- **Per wave merge:** `cd app/command-center && npm test` (full 98+ test suite, should grow to ~110+ with the new loader's tests)
- **Phase gate:** Full suite green before `/gsd-verify-work`; plus the manual deploy-gate check above.

### Wave 0 Gaps
- [ ] `app/command-center/src/lib/executive-pipeline.test.ts` — covers REQ-10 (funnel grouping, close-rate windowing, margin fallback + coverage, region join, pagination regression guard, freshness badges)
- [ ] No shared fixture gap — `weekly-snapshot.ts`'s existing row-shape interfaces (`PipelineRow`, `AbcInvoiceRow`) can be reused/adapted directly as test fixtures.
- [ ] Framework install: none — Vitest is already the project's test runner; no new framework needed.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Yes (inherited, not phase-specific) | Existing WorkOS AuthKit gating on all Command Center HTML routes (unchanged per CONTEXT.md discretion note — "keep the existing WorkOS gating as-is") |
| V3 Session Management | Yes (inherited) | WorkOS session cookies, unchanged |
| V4 Access Control | Yes (inherited) | Same viewer domains/roles as the rest of the Executive tab; no new role introduced by this phase |
| V5 Input Validation | Yes | The new `/api/executive/pipeline.json` endpoint must validate/allowlist filter query params (location/region/type/window) against known enum values before building Supabase query filters — never interpolate raw query-string values into a `.eq()`/`.in()` filter without validating against the known account_key/job_category_name/window-token sets |
| V6 Cryptography | No | No new cryptographic operation introduced by this phase |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Unvalidated filter param used directly in a Supabase `.eq()`/`.in()` clause (minor injection/DoS surface, not classic SQL injection since PostgREST parameterizes, but an unbounded `.in()` list or unexpected column name could still cause query errors or unintended data exposure) | Tampering | Validate every incoming filter value (location, region, commercial/residential, window) against a small fixed allowlist (the 8 `account_key`s, the 3 `job_category_name` values, the finite window-token set) before constructing any Supabase query filter — reject/ignore unknown values rather than passing them through. |
| Leaking financial/margin data to an unauthorized viewer role via the new JSON endpoint (`/api/executive/pipeline.json`) bypassing the page-level WorkOS gate that protects the `.astro` route | Information Disclosure | The JSON API route must independently enforce the same WorkOS session check the `.astro` page relies on — do not assume an API route is protected just because the page that calls it is; Astro API routes are separately reachable. |
| Auto-refresh polling amplifying load (many open exec tabs, each polling every N minutes) | Denial of Service (self-inflicted) | Keep the auto-refresh interval conservative (minutes, not seconds — D-11 discretion) and ensure the JSON endpoint reuses the same caching pattern as `loadWeeklySnapshot`/`loadDepartmentSurface` (in-memory TTL cache + inflight-dedup) so concurrent poll requests don't each re-run the full aggregation. |

## Sources

### Primary (HIGH confidence)
- Live Supabase PostgREST queries against project `rnhmvcpsvtqjlffpsayu` (this session, 2026-07-01/02): `acculynx_job_financials` (1 row, archived), `crm_pipeline` (7,053 rows, milestone distribution), `acculynx_jobs` (6,434 rows, full account_key + job_category_name distribution via paginated query), `v_invoice_acculynx_match` (995 total, 151 matched), `acculynx_accounts` (9-row registry), `acculynx_sync_watermark` (per-account `last_sync_at`), `v_acculynx_cron_outcomes` (recent runs, all `success`), `acculynx_job_milestone_history` (0 rows).
- `npm view chart.js version/license/repository.url/scripts.postinstall`, `npm view echarts version/license/repository.url`, `npm view uplot version/license/repository.url` (this session).
- In-repo source: `app/command-center/src/lib/weekly-snapshot.ts`, `src/lib/live-work.ts`, `src/lib/nav.ts`, `src/pages/executive/[slug].astro`, `src/pages/weekly-snapshot.astro`, `src/scripts/weekly-snapshot.ts`, `astro.config.mjs`, `package.json`, `docs/knowledge-base/acculynx/*` (this session).
- `npx vitest run` executed live in `app/command-center` (this session): 98/98 tests passing.

### Secondary (MEDIUM confidence)
- Klipfolio, Salesforce, Tableau, Outreach — sales/pipeline KPI best-practice web search (WebSearch, not independently cross-verified against a second source per claim).
- Home Service Scorecard, TopBuilder (topbuildersolutions.com) — roofing/construction-specific KPI content (gross margin, bid-to-award ratio, job margin gain/fade).
- UXPin, DataCamp, Improvado, uxpilot.ai — executive dashboard layout/hierarchy/anti-pattern best practices (F-pattern scanning, 40-30-20-10 space rule, 5-9 KPI cognitive-load ceiling, 5-second comprehension target).
- Medium (lalatenduswain), Casey Primozic's notes, SciChart blog, PkgPulse — chart-library bundle-size comparisons (third-party benchmarks, not independently re-measured in this repo's build).
- GitHub issue `leeoniya/uPlot#9` — confirms uPlot's lack of native categorical/funnel x-axis support (feature request, not shipped).

### Tertiary (LOW confidence)
- None carried forward as authoritative — all WebSearch-only findings above are explicitly tagged `[CITED]`/`[ASSUMED]` in-context and cross-checked against at least the package registry or in-repo evidence where a factual claim mattered for a recommendation.

## Metadata

**Confidence breakdown:**
- Standard stack (chart library pick): HIGH — verified live via npm registry (version, license, repo, no postinstall) plus a clear architectural disqualifier for uPlot (no funnel support) found via a linked GitHub issue.
- Architecture (loader/join patterns, pagination, milestone casing): HIGH — every claim in this section was independently reproduced via live Supabase queries in this session, not inferred from docs alone.
- KPI/dashboard-UX best practices (funnel/leaderboard/AR framing, layout hierarchy, anti-patterns): MEDIUM — corroborated across several independent web sources but not roofing-proprietary primary research; flagged as `[CITED]` throughout, never presented as a locked requirement beyond the already-locked D-05 anchors.
- Pitfalls (job-financials coverage, market-vs-account_key, PostgREST cap, milestone-history absence, casing mismatch): HIGH — every pitfall in this document was directly observed against the live production database in this research session.

**Research date:** 2026-07-01 (live-DB queries and package-registry checks run 2026-07-02 per system clock during this session)
**Valid until:** 30 days for the architecture/pitfalls sections (stable schema); 7 days for the live-DB coverage numbers specifically (row counts, `acculynx_job_financials` coverage, invoice-match rate) since ingestion is actively expanding per the runbook's "6-account expansion" note — re-verify coverage numbers immediately before implementation if more than a few days have passed.
