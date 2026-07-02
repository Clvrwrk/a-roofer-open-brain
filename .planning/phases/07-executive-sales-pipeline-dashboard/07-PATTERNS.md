# Phase 7: Executive Sales Pipeline Dashboard - Pattern Map

**Mapped:** 2026-07-01
**Files analyzed:** 11 (new/modified/deleted)
**Analogs found:** 10 / 11

## File Classification

| New/Modified/Deleted File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `app/command-center/src/lib/executive-pipeline.ts` | service (loader) | CRUD / aggregation | `src/lib/weekly-snapshot.ts` | exact |
| `app/command-center/src/pages/executive/pipeline.astro` (replaces `[slug].astro` default route) | route (Astro page) | request-response (SSR) | `src/pages/weekly-snapshot.astro` | exact |
| `app/command-center/src/pages/api/executive/pipeline.json.ts` | route (API/JSON) | request-response | `src/pages/api/product-surface.json.ts` | role-match |
| `app/command-center/src/scripts/executive-pipeline.ts` | client script | event-driven (DOM) | `src/scripts/weekly-snapshot.ts` | exact |
| `app/command-center/src/lib/nav.ts` (MODIFIED) | config | — | itself (existing Executive `items` array) | exact |
| `app/command-center/package.json` (MODIFIED — add chart.js) | config | — | n/a (dependency add) | n/a |
| `app/command-center/src/lib/executive-pipeline.test.ts` | test | unit | `src/lib/acculynx-pending-write.test.ts` | exact |
| `app/command-center/src/pages/weekly-snapshot.astro` (DELETE, D-02) | route | — | — | deletion target |
| `app/command-center/src/scripts/weekly-snapshot.ts` (DELETE, D-02) | client script | — | — | deletion target |
| `app/command-center/src/lib/weekly-snapshot.ts` (DELETE, D-02) | service | — | — | deletion target |
| `app/command-center/src/lib/weekly-snapshot-routes.ts`, `src/pages/weekly-snapshot/[slice].astro`, `.../records/[record].astro`, `.../rep/[rep].astro` (DELETE — additional D-02 scope found via grep, not in original hint list) | route/service | — | — | deletion target |

**Deletion-scope correction:** CONTEXT.md/RESEARCH.md name only 3 files for D-02, but `grep -rl "weekly-snapshot"` surfaced 4 more files that must be deleted in the same pass or the build will fail on dangling imports:
- `src/lib/weekly-snapshot-routes.ts` (111 lines — route-slug helper consumed by the sub-pages below)
- `src/pages/weekly-snapshot/[slice].astro`
- `src/pages/weekly-snapshot/records/[record].astro`
- `src/pages/weekly-snapshot/rep/[rep].astro`

Also touched (not new files, but require edits when `weekly-snapshot.ts`/`.astro` are deleted):
- `app/command-center/src/lib/prewarm.server.ts` — line 12 `import { loadWeeklySnapshot } from "@lib/weekly-snapshot";`, line 45 `{ name: "weekly_snapshot", run: () => loadWeeklySnapshot() }` — replace with an `executive_pipeline` prewarm entry calling the new loader (see Shared Patterns → Prewarm below), or remove the entry if prewarm isn't needed for the new dashboard.
- `app/command-center/src/layouts/AppShell.astro` — line 163 references `/weekly-snapshot` (likely in a route list, e.g. for prefetch/sw). Update to `/executive/pipeline`.

## Pattern Assignments

### `src/lib/executive-pipeline.ts` (service, CRUD/aggregation)

**Analog:** `src/lib/weekly-snapshot.ts` (737 lines)

**Imports pattern** (lines 1-3):
```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@lib/supabase.server";
import { getRuntimeEnv, type RuntimeEnv } from "@lib/runtime-env";
```

**Status/config-guard pattern** (lines 302-320, inside `loadLiveData`):
```typescript
async function loadLiveData(env: RuntimeEnv): Promise<LiveSnapshotData> {
  const { client, config } = createServerSupabaseClient(env);
  if (!client) {
    return {
      actions: [], errors: config.missing.map((name) => `Missing ${name}`),
      invoices: [], pipeline: [], reviewRows: [],
      stats: { abcInvoices: 0, abcLatestFetch: null, acculynxJobs: 0, acculynxLatestSync: null },
      status: "unconfigured",
    };
  }
  // ...
}
```
Apply this exact "unconfigured" fallback shape to `executive-pipeline.ts` so a missing Supabase env doesn't crash SSR — return a degraded dashboard payload with `errors` populated instead.

**Mandatory pagination helper — copy verbatim** (lines 260-281):
```typescript
async function selectAll<T>(
  client: SupabaseClient,
  table: string,
  columns: string,
  query?: (builder: any) => any,
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  for (;;) {
    const to = from + PAGE_SIZE - 1;
    let builder = client.from(table).select(columns).range(from, to);
    if (query) builder = query(builder);
    const { data, error } = await builder;
    if (error) throw new Error(`${table}: ${error.message || error.code || "query failed"}`);
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return rows;
    from += batch.length;
  }
}
```
RESEARCH.md Pitfall 3 confirms this is a live, reproduced pitfall this session (unpaginated `acculynx_jobs` query silently returned only 1000 rows, all one account). Any full-table query in the new loader (`crm_pipeline`, `acculynx_jobs`, `abc_invoice_lines`) MUST go through this helper or an equivalent `.range()` loop.

**Window/date filtering pattern — copy verbatim** (line 192, and the sold/lead milestone-set precedent at 557-564):
```typescript
function inWindow(value: string | null | undefined, start: Date, end: Date) { /* existing impl */ }

const soldMilestones = new Set(["approved", "completed", "invoiced", "closed"]);
// leadMilestones.has(milestone) && inWindow(row.lead_date ?? row.created_at, start, end)
// soldMilestones.has(milestone) && inWindow(row.approved_date ?? row.milestone_date ?? row.updated_at, start, end)
```
Reuse this snapshot-vs-cohort close-rate proxy pattern directly (RESEARCH.md Pitfall 4 — `acculynx_job_milestone_history` has 0 rows, a true transition-based rate is not computable). Use `crm_pipeline.current_milestone` (already lowercase-normalized) for ALL milestone comparisons — never `acculynx_jobs.current_milestone` (Title Case) — per RESEARCH.md Pitfall 5.

**Row-shape interfaces to reuse/extend as test fixtures** (lines 65-90, `PipelineRow`; lines 92-101, `AbcInvoiceRow`):
```typescript
interface PipelineRow {
  id: number | string;
  acculynx_job_id: string | null;
  job_name: string | null;
  location_city: string | null;
  location_state: string | null;
  market: string | null;
  current_milestone: string | null;
  primary_salesperson: string | null;
  contract_amount: number | string | null;
  primary_estimate_amount: number | string | null;
  balance_due: number | string | null;
  lead_date: string | null;
  approved_date: string | null;
  milestone_date: string | null;
  created_at: string | null;
  updated_at: string | null;
  insurance_company: string | null;
  insurance_claim_number: string | null;
  insurance_claim_filed: boolean | null;
  insurance_claim_filed_date: string | null;
  insurance_date_of_loss: string | null;
  parent_lead_source: string | null;
  sub_lead_source: string | null;
  data_source: string | null;
}
```
RESEARCH.md flags: `market` is NOT the account_key/location dimension (Pitfall 2) — the new loader must ALSO select `acculynx_job_id` (already present above) and join to `acculynx_jobs.account_key`/`job_category_name` for D-13's region/office/commercial-residential filter. `PipelineRow` does not need new fields for that join; add a second `AcculynxJobRow` interface (account_key, job_category_name, id) fetched via `selectAll` and joined in-memory by `acculynx_job_id`.

**New pattern this phase introduces (no analog — build fresh per RESEARCH.md Pattern 4):** margin-% coverage computation. Follow the documented shape:
```typescript
interface MarginCoverage {
  jobsWithCostData: number;
  totalJobsInSlice: number;
  coveragePct: number; // jobsWithCostData / totalJobsInSlice
}
```
Primary source `acculynx_job_financials` (verify live — RESEARCH.md found 0% production coverage as of research date, re-verify immediately before implementing per the "valid until 7 days" note), fallback `contract_amount − invoiced cost` via `v_invoice_acculynx_match` + `abc_invoice_lines`. Never silently default missing cost data to 0.

**Error handling pattern** (mirrors `loadLiveData`'s try/catch wrapping `Promise.all`, lines 322+): wrap all parallel `selectAll` calls in `Promise.all([...])` inside a try/catch, push caught errors into an `errors: string[]` array on the returned payload rather than throwing — SSR must always render a degraded-but-present dashboard, never a 500.

---

### `src/pages/executive/pipeline.astro` (route, request-response/SSR)

**Analog:** `src/pages/weekly-snapshot.astro` (242 lines) — also supersedes the `[slug].astro` stub (D-01: `/executive/pipeline` is the existing stub's default slug; the stub's `DepartmentDetail`/`loadDepartmentSurface("executive")` pattern is NOT the right analog for the full dashboard — use `weekly-snapshot.astro`'s bespoke-page pattern instead, since this is a purpose-built dashboard, not a generic `DepartmentDetail` view).

**Frontmatter data-loading pattern** (lines 1-11):
```astro
---
import AppShell from "../layouts/AppShell.astro";
import { loadWeeklySnapshot, type SnapshotMetric, type SnapshotRecord, type SnapshotRow } from "@lib/weekly-snapshot";

const snapshot = await loadWeeklySnapshot();
const generatedAt = new Intl.DateTimeFormat("en-US", {
  day: "numeric", hour: "numeric", minute: "2-digit", month: "short",
}).format(new Date(snapshot.generatedAt));
---
```
Adapt: `import { loadExecutivePipelineDashboard } from "@lib/executive-pipeline";` and seed initial filters from `Astro.url.searchParams` per RESEARCH.md's SSR-friendly-first-paint architecture note.

**AppShell page-chrome usage** (line 90):
```astro
<AppShell title="Weekly Snapshot" eyebrow="AccuLynx + Open Brain" activePage="snapshot">
```
New page: `<AppShell title="Sales Pipeline" eyebrow="AccuLynx + Open Brain" activePage="executive-pipeline">` (confirm the exact `activePage` token AppShell expects by checking its prop/nav-highlight contract before finalizing — grep `AppShell.astro` for how `activePage` maps to `nav.ts` items).

**Health/error banner pattern** (lines 96-114) — reuse directly for D-12 freshness + any load errors:
```astro
<div class="snapshot-health" aria-label="Snapshot source health">
  {snapshot.health.map((source) => (
    <span class="snapshot-source" data-source-status={source.status}>
      <strong>{source.label}</strong>
      <span>{source.detail}</span>
    </span>
  ))}
</div>
{snapshot.errors.length > 0 && (
  <div class="snapshot-alert" role="status">{snapshot.errors.join(" ")}</div>
)}
```
UI-SPEC.md's "Error state" copy contract ("{Source} is unavailable right now — showing the last successful load.") pairs with this exact `.snapshot-alert` class.

**Metric-card + drilldown-trigger pattern** (lines 125-144) — this is the direct precedent for D-05's KPI card row and D-09's two-level drill-down trigger wiring:
```astro
<div class="snapshot-metric-grid" aria-label="Topline metrics">
  {snapshot.metrics.map((metric) => (
    <a class={metricClass(metric)} href={metric.href} data-drilldown
       data-title={metric.label} data-value={metric.value}
       data-caption={metric.caption} data-records={asData(metric.records)}>
      <span class="metric-icon" aria-hidden="true">{metric.label.charAt(0)}</span>
      <strong>{metric.label}</strong>
      <small>{metric.caption}</small>
      <b>{metric.value}</b>
    </a>
  ))}
</div>
```
UI-SPEC.md directs the new KPI row to use `.live-metric-grid`/`.live-metric-card` (4-up, tone-badge) styling instead of `.snapshot-metric-grid` — reuse this `data-drilldown`/`data-records` JSON-embedding wiring pattern, but swap the CSS class family to the `.live-metric-*` one named in the UI spec.

---

### `src/pages/api/executive/pipeline.json.ts` (route, JSON API)

**Analog:** `src/pages/api/product-surface.json.ts` (10 lines — full file, exact minimal-endpoint pattern)
```typescript
import type { APIRoute } from "astro";
import { jsonResponse } from "@lib/agent-auth";
import { loadProductSurface } from "@lib/product-data";

export const prerender = false;

export const GET: APIRoute = async () => {
  const surface = await loadProductSurface();
  return jsonResponse(surface);
};
```
Adapt directly:
```typescript
import type { APIRoute } from "astro";
import { jsonResponse } from "@lib/agent-auth";
import { loadExecutivePipelineDashboard } from "@lib/executive-pipeline";

export const prerender = false;

export const GET: APIRoute = async ({ url, locals }) => {
  // validate/allowlist filter query params here (RESEARCH.md Security Domain V5) before building filters
  // independently enforce the same WorkOS session check the page relies on (RESEARCH.md Security Domain, Info Disclosure row)
  const dashboard = await loadExecutivePipelineDashboard(/* validated filters */);
  return jsonResponse(dashboard);
};
```
**Security note (no direct in-repo analog — flag for planner):** none of the sampled `api/*.ts` files in this pass show an explicit per-route WorkOS re-check; confirm during planning whether `jsonResponse`/an Astro middleware already gates `/api/*` globally (check `src/middleware.ts` if present) or whether this new route needs its own explicit session check, per RESEARCH.md's "Information Disclosure" threat row.

---

### `src/scripts/executive-pipeline.ts` (client script, event-driven)

**Analog:** `src/scripts/weekly-snapshot.ts` (110 lines, full file read — small enough for one pass)

**JSON-parse-from-data-attribute pattern** (lines 19-26) — copy verbatim, this is RESEARCH.md's named Pattern 1:
```typescript
function parseRecords(trigger: HTMLElement): DashboardRecord[] {
  try {
    const records = JSON.parse(trigger.dataset.records ?? "[]") as DashboardRecord[];
    return Array.isArray(records) ? records : [];
  } catch {
    return [];
  }
}
```

**Drill-down activation pattern** (lines 65-85) — the D-09 two-level drill-down precedent:
```typescript
function activate(trigger: HTMLElement, updateHistory = true) {
  const records = parseRecords(trigger);
  const title = trigger.dataset.title ?? "Weekly Snapshot";
  const value = trigger.dataset.value ?? "";
  const caption = trigger.dataset.caption ?? "Filtered dashboard";
  const href = trigger.getAttribute("href") ?? "/weekly-snapshot#snapshot-dashboard";

  for (const item of triggers) item.removeAttribute("aria-current");
  trigger.setAttribute("aria-current", "true");
  // ...update dashboard panel DOM nodes, then renderRows(records)

  if (updateHistory) window.history.replaceState(null, "", href);
}
```
Adapt: swap default fallback strings (`"Weekly Snapshot"`, `/weekly-snapshot#snapshot-dashboard`) to the new page's equivalents; extend `activate()` to also mount/refresh the relevant Chart.js instance for chart-segment triggers (RESEARCH.md Pattern 2/Pitfall 6 — Chart.js must mount client-side only, never in Astro frontmatter).

**New, no-analog additions this script must add** (RESEARCH.md Architecture Patterns + UI-SPEC.md Auto-refresh section):
1. Chart.js tree-shaken registration + mount (RESEARCH.md Code Examples section — copy the import list, register only used controllers).
2. Global filter bar wiring → re-fetch `/api/executive/pipeline.json` on change, re-render in place (no navigation).
3. `setInterval` silent poll, 5-minute cadence (UI-SPEC.md Auto-refresh & filter-change UX section) — re-fetches the same JSON endpoint, must not reset active filters or open drill-down state.

---

### `src/lib/nav.ts` (config, MODIFIED)

**Current Executive section** (lines 89-97):
```typescript
{
  id: "executive",
  label: "Executive",
  icon: "executive",
  items: [
    { label: "Overview", href: "/executive", status: "built" },
    { label: "Weekly Snapshot", href: "/weekly-snapshot", status: "built" },
  ],
},
```
**Required edit (D-01):** rename the second item's label and href:
```typescript
{ label: "Sales Pipeline", href: "/executive/pipeline", status: "built" },
```
`/executive` (Overview) entry is untouched — `DepartmentHome`/`loadDepartmentSurface("executive")` stays the live-work surface per CONTEXT.md.

---

### `src/lib/executive-pipeline.test.ts` (test, unit)

**Analog:** `src/lib/acculynx-pending-write.test.ts` (Vitest conventions — imports, fixture-builder functions, `describe`/`it` structure)
```typescript
import { describe, expect, it, vi } from "vitest";
import { /* functions under test */ } from "@lib/executive-pipeline";

function makeRow(overrides: Partial<PipelineRow> = {}): PipelineRow {
  return {
    id: 1,
    acculynx_job_id: "job-1",
    // ...full shape with sensible defaults...
    ...overrides,
  };
}

describe("funnel grouping", () => {
  it("groups by normalized lowercase milestone", () => { /* ... */ });
});
```
Per RESEARCH.md's Phase Requirements → Test Map, structure `describe` blocks around: `"funnel"`, `"close rate"`, `"margin"`, `"region"`, `"pagination"`, `"freshness"` — these are the exact `-t` grep filters the test map's automated commands expect, so name `describe`/`it` blocks to match those substrings.

---

## Shared Patterns

### `createServerSupabaseClient` usage
**Source:** `src/lib/weekly-snapshot.ts` lines 2-3, 303
```typescript
import { createServerSupabaseClient } from "@lib/supabase.server";
import { getRuntimeEnv, type RuntimeEnv } from "@lib/runtime-env";
// ...
const { client, config } = createServerSupabaseClient(env);
if (!client) { /* return degraded/unconfigured payload */ }
```
**Apply to:** `executive-pipeline.ts` loader, and `pipeline.json.ts` API route (via the loader — do not instantiate Supabase directly in the route).

### Error handling / degraded rendering
**Source:** `src/lib/weekly-snapshot.ts` `loadLiveData` unconfigured-guard + errors array; `src/pages/weekly-snapshot.astro` lines 108-114 `.snapshot-alert` banner.
**Apply to:** All new lib/page files — never let a Supabase error 500 the SSR page; collect into `errors: string[]`, render the existing `.snapshot-alert`-equivalent banner, and (per UI-SPEC.md) show "{Source} is unavailable right now — showing the last successful load."

### Pagination (`selectAll` `.range()` loop)
**Source:** `src/lib/weekly-snapshot.ts` lines 260-281 (verbatim reuse recommended — either import if exported, or copy the function into the new file since it's not currently exported from `weekly-snapshot.ts`).
**Apply to:** Every full-table query in `executive-pipeline.ts` against `crm_pipeline`, `acculynx_jobs`, `abc_invoice_lines`/`v_invoice_acculynx_match`.

### AppShell page chrome
**Source:** `src/layouts/AppShell.astro` (used as `<AppShell title=... eyebrow=... activePage=...>` wrapper in every page-level `.astro` file, e.g. `weekly-snapshot.astro` line 90).
**Apply to:** `executive/pipeline.astro`. Also note: `AppShell.astro` line 163 currently hardcodes `/weekly-snapshot` in some list (prefetch/sw registration) — must be updated to `/executive/pipeline` when the old route is deleted.

### Prewarm cache registration
**Source:** `src/lib/prewarm.server.ts` lines 12, 45:
```typescript
import { loadWeeklySnapshot } from "@lib/weekly-snapshot";
// ...
{ name: "weekly_snapshot", run: () => loadWeeklySnapshot() },
```
**Apply to:** Replace with an `executive_pipeline` entry calling `loadExecutivePipelineDashboard()` (or remove the prewarm entry entirely if the new loader's cost profile doesn't warrant prewarming — planner's discretion, but the import MUST be updated/removed or the build breaks).

### JSON API endpoint minimal shape
**Source:** `src/pages/api/product-surface.json.ts` (full file, 10 lines) — `export const prerender = false;` + `jsonResponse()` from `@lib/agent-auth`.
**Apply to:** `pages/api/executive/pipeline.json.ts`.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| Chart.js mounting code (inside `scripts/executive-pipeline.ts`) | client script (charting) | event-driven | Zero charting dependencies exist anywhere in this repo today (RESEARCH.md Standard Stack) — no in-repo analog; use RESEARCH.md's Code Examples section (Chart.js official docs pattern, tree-shaken registration) as the reference instead. |
| Margin-% coverage badge computation | service (aggregation) | transform | Net-new pattern this phase introduces (RESEARCH.md Pattern 4) — no prior profitability/coverage computation exists in the codebase; build from RESEARCH.md's documented `MarginCoverage` interface and UI-SPEC.md's mandatory caption copy. |
| Global filter bar → JSON re-fetch wiring | client script | request-response | `.gap-filter-bar` (named in UI-SPEC.md as the closest visual/grid precedent) is a CSS class in `src/styles/global.css` used by data-quality gap surfaces, but no in-repo client script demonstrates a full "filter change → JSON re-fetch → re-render in place" flow (the closest is the drilldown activate() pattern, which reads from already-embedded JSON, not a live re-fetch). Planner should treat this as a genuinely new interaction wired from scratch using the fetch + DOM-replace idioms already used elsewhere (e.g., `activate()`'s DOM node updates), not copied wholesale from one file. |

## Metadata

**Analog search scope:** `app/command-center/src/lib/`, `src/pages/`, `src/pages/api/`, `src/scripts/`, `src/layouts/`, `src/components/live/`
**Files scanned:** `weekly-snapshot.ts` (737 lines, 2 targeted reads), `weekly-snapshot.astro` (242 lines, 2 targeted reads), `weekly-snapshot.ts` client script (110 lines, 1 full read), `weekly-snapshot-routes.ts` (111 lines, size only — deletion target, not pattern source), `product-surface.json.ts` (10 lines, full read), `acculynx-pending-write.test.ts` (partial read, fixture/describe conventions), `nav.ts` (partial read, Executive section), `executive/index.astro` + `executive/[slug].astro` (full read, both short), `prewarm.server.ts` / `AppShell.astro` (grep only, confirmed weekly-snapshot references), `package.json` (grep only, confirmed no existing chart dep)
**Pattern extraction date:** 2026-07-01
