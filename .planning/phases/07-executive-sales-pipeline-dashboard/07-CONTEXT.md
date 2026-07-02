# Phase 7: Executive Sales Pipeline Dashboard - Context

**Gathered:** 2026-07-01
**Status:** Ready for planning

<domain>
## Phase Boundary

A realtime, executive-grade sales pipeline dashboard under the Executive tab of
cc.proexteriorsus.net that proves the full multi-location AccuLynx data is present and replaces
the weekly snapshot (REQ-10). Scope: SC1 research → dashboard spec; the dashboard page itself
(all 8 location accounts, filterable, hourly-fresh); retirement of the weekly snapshot; deploy +
live verify. NOT in scope: new ingestion, new write lanes, agent features, or any non-Executive
surface changes.

</domain>

<decisions>
## Implementation Decisions

### Placement & replacement
- **D-01:** The dashboard lives at **`/executive/pipeline`** (the existing `[slug]` stub's default
  slug). The nav's "Weekly Snapshot" entry under Executive becomes **"Sales Pipeline"**.
  `/executive` (index) stays the standard DepartmentHome live-work surface — do not break the
  cross-department pattern.
- **D-02:** **Delete the `/weekly-snapshot` route outright** — remove the page and its loader
  (`weekly-snapshot.astro`, `scripts/weekly-snapshot.ts`, and `lib/weekly-snapshot.ts` once
  nothing else imports it). No redirect, no legacy page; the route 404s. Anything worth keeping
  from its sections is absorbed by the new dashboard.
- **D-03:** **Selectable time windows** on window-based KPIs (this week / last 7 days / month /
  quarter — exact set at planner's discretion) so the old weekly ritual survives as one option.
  Point-in-time KPIs (pipeline value, AR) show current state.

### KPI scope & audience
- **D-04:** Audience is **both, exec-first**: PE owners/C-suite at-a-glance first, with enough
  drill-down that sales leadership can run with it.
- **D-05 (anchor KPIs — LOCKED; research fills/refines but cannot drop):**
  1. **Pipeline value by stage/milestone** (funnel view, cross-location).
  2. **Jobs sold + close rate** (sold count/value in window; lead→sold conversion).
  3. **New leads volume** (by location/market and lead source).
  4. **Rep leaderboard + AR rollup** (carried over from the weekly snapshot).
  5. **Breakdowns by region, office, commercial/residential, sales team, sales rep — with
     PROFITABILITY PER JOB ranked ahead of job quantity** (user-added; this is the emphasis).
- **D-06 (profitability definition):** **AccuLynx gross profit** (job-financials/worksheet mirror)
  is the primary profit source; **where missing, fall back to contract value − invoiced costs**
  (vendor invoice lines tied to the job); **margin % is the lead presentation** (dollar profit
  secondary) so different-sized jobs compare fairly. Research/planning MUST verify field coverage
  per location before committing to the exact computation (live-DB verification, not migration
  files).
- **D-07:** SC1 research (Firecrawl/Exa/Tavily per ROADMAP) produces the dashboard spec: it
  refines KPI presentation, adds researched C-suite KPIs beyond the anchors, and picks the chart
  library (D-08). The spec lands in the OKF bundle (ROADMAP SC3 for Phase 6 already names a
  "dashboard spec" as an OKF artifact).

### Visualization
- **D-08:** **Add ONE lightweight, well-established chart library** (the app currently has zero
  charting deps). Research picks the specific library (ECharts/Chart.js class; license/provenance
  review per repo culture); planner wires it into the Astro/vanilla-TS stack. No heavyweight
  framework adoption (no React just for charts).
- **D-09:** **Drill-down is two levels:** click any KPI/chart segment → filtered job-level table
  in-dashboard (pattern precedent: the snapshot's drill-down record tables) → each row links out
  to the job in AccuLynx. No intermediate breakdown pages.
- **D-10:** **Fully responsive** — KPI cards stack, charts resize, tables scroll on mobile. One
  codebase; executives will check this from phones.

### Freshness & filtering
- **D-11:** **Server-render live DB data on load + silent client auto-refresh** every few minutes
  (exact cadence planner's discretion) so a left-open tab stays current. No Supabase Realtime
  push — the data only changes hourly via the cron.
- **D-12:** **Per-location freshness badges** driven by the real ingestion watermarks / cron
  outcomes (`acculynx_sync_watermarks`, `v_acculynx_cron_outcomes`): "data as of" per location,
  visibly flagged when any location is stale beyond the hourly SLA. Honest, not cosmetic.
- **D-13:** **Global filter bar** (location/office, region, commercial vs residential) at the top;
  every KPI, chart, and drill-down obeys it. Default = all locations rolled up.

### Claude's Discretion
- Exact time-window set and default window (D-03), auto-refresh cadence (D-11), staleness
  threshold styling (D-12).
- Dashboard layout/section ordering — grounded in the SC1 research.
- How region and commercial/residential are derived (account registry `market`/program fields vs
  job attributes) — verify against the live DB; document the mapping in the spec.
- The chart library shortlist and final pick (D-08), subject to license/provenance sanity.
- Access: keep the existing WorkOS gating as-is (viewer domains/roles unchanged) unless research
  surfaces a reason to restrict further.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase requirements & data truth
- `.planning/ROADMAP.md` — Phase 7 entry: goal, 4 success criteria (research → spec, dashboard
  under Executive tab, 8 accounts filterable + hourly SLA, deployed + verified).
- `.planning/PROJECT.md` — REQ-10 text, stack constraints, deploy/approval gates.
- `docs/knowledge-base/acculynx/index.md` — OKF bundle root: data map (which `acculynx_*` tables
  hold jobs, milestones, financials, contacts), account registry, ingestion docs. The dashboard
  spec artifact should land in/next to this bundle.
- `docs/knowledge-base/acculynx/ingestion/runbook.md` — watermark/cron-outcome machinery that
  feeds the D-12 freshness badges.

### Code being replaced / extended
- `app/command-center/src/lib/weekly-snapshot.ts` — the loader being retired: its `PipelineRow`
  shape shows exactly which pipeline fields are already query-proven (milestone, salesperson,
  contract_amount, balance_due, lead/approved dates, market).
- `app/command-center/src/pages/weekly-snapshot.astro` + `src/scripts/weekly-snapshot.ts` — the
  page + drill-down interaction pattern being deleted (its drill-down UX is the precedent for
  D-09).
- `app/command-center/src/pages/executive/[slug].astro` — the stub the dashboard replaces
  (default slug is already "pipeline").
- `app/command-center/src/lib/nav.ts` — Executive tab entries to update (D-01).

### Deploy contract
- `.claude/skills/coolify/SKILL.md` — the deploy + healthz-verify play for SC4.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/weekly-snapshot.ts` query patterns: already reads AccuLynx pipeline rows with milestone,
  salesperson, amounts, dates, market — the new loaders start from these proven shapes.
- Snapshot drill-down record tables (`scripts/weekly-snapshot.ts` client script): the two-level
  drill-down interaction precedent for D-09.
- `AppShell.astro` + department page conventions; `loadDepartmentSurface`/`DepartmentHome` stays
  untouched at `/executive`.
- Phase 3 observability: `v_acculynx_cron_outcomes` + watermark tables power D-12 badges.

### Established Patterns
- Astro SSR + vanilla TS client scripts; no React; zero chart deps today (D-08 adds exactly one).
- Server-side Supabase access via `createServerSupabaseClient`; WorkOS gating on HTML routes.
- Vitest suite (98 tests) + deploy gate: converge to main, push, watch healthz buildCommit.

### Integration Points
- Nav (`lib/nav.ts`) Executive section; `/executive/[slug]` route; Supabase `acculynx_*` +
  `crm_pipeline` tables; watermark/cron-outcome views; Coolify deploy (SC4).

</code_context>

<specifics>
## Specific Ideas

- The user's emphasis, verbatim intent: breakdowns "by region, office, commercial/residential,
  sales team, sales rep (focus on profitability per job then qty of jobs)" — profit-per-job
  margin is the headline lens, volume second.
- Profitability sourcing chain explicitly chosen: AccuLynx GP → fallback computed
  (contract − invoiced costs) → presented margin-%-first.

</specifics>

<deferred>
## Deferred Ideas

- **Side-by-side office/region compare mode** — offered during filtering discussion; user chose
  the plain global filter bar for v1. A compare/benchmark view could be a future enhancement.
- (Carried from earlier phases, unrelated to this one: ob-acculynx Slack provisioning lives in
  the separate Slack project; first live prod payment write deferred until a real need.)

</deferred>

---

*Phase: 7-executive-sales-pipeline-dashboard*
*Context gathered: 2026-07-01*
