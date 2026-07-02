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

// Tree-shaken registration — only the controllers/elements this dashboard uses
// (RESEARCH.md Code Examples), keeping the bundle near Chart.js's ~60KB minimal
// footprint rather than the ~110KB full build.
Chart.register(BarController, BarElement, LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend);

// ---------------------------------------------------------------------------
// Types (mirrors app/command-center/src/lib/executive-pipeline.ts)
// ---------------------------------------------------------------------------

interface FunnelStage {
  milestone: string;
  count: number;
  value: number;
}

interface MarginCoverage {
  jobsWithCostData: number;
  totalJobsInSlice: number;
  coveragePct: number;
}

interface MarginByDimensionRow {
  dimension: string;
  marginPct: number;
  avgDollarProfit: number;
  coverage: MarginCoverage;
  caption: string;
}

interface LeaderboardRow {
  salesperson: string;
  soldCount: number;
  soldValue: number;
  arBalance: number;
}

interface FreshnessBadge {
  accountKey: string;
  tone: "ready" | "review" | "critical";
  lastSyncAt: string | null;
  label: string;
}

interface CloseRateResult {
  leadCount: number;
  soldCount: number;
  closeRate: number;
  soldValue: number;
  qualifier: string;
}

interface LocationRollupRow {
  accountKey: string;
  pipelineValue: number;
  soldValue: number;
  soldCount: number;
  leadCount: number;
  arValue: number;
}

interface ExecutivePipelineDashboard {
  status: "live" | "degraded" | "unconfigured";
  generatedAt: string;
  errors: string[];
  filters: { window: string; accountKey: string; commercialResidential: string };
  window: { start: string; end: string; label: string };
  funnel: FunnelStage[];
  closeRate: CloseRateResult;
  newLeadsCount: number;
  marginByRegion: MarginByDimensionRow[];
  marginByOffice: MarginByDimensionRow[];
  marginByCommercialResidential: MarginByDimensionRow[];
  marginByRep: MarginByDimensionRow[];
  leaderboard: LeaderboardRow[];
  locationRollup: LocationRollupRow[];
  arTotal: number;
  freshness: FreshnessBadge[];
  pipelineValueTotal: number;
}

interface JobDrillRow {
  acculynxJobId: string | null;
  jobName: string;
  accountKey: string;
  milestone: string;
  contractAmount: number;
  salesperson: string;
}

interface DashboardConfig {
  acculynxJobBaseUrl: string;
}

// ---------------------------------------------------------------------------
// Embedded-JSON hydration (Pattern 1 — SSR-first-paint + client-JSON-hydration)
// ---------------------------------------------------------------------------

function readEmbeddedJson<T>(id: string, fallback: T): T {
  const node = document.getElementById(id);
  if (!node || !node.textContent) return fallback;
  try {
    return JSON.parse(node.textContent) as T;
  } catch {
    return fallback;
  }
}

let currentDashboard = readEmbeddedJson<ExecutivePipelineDashboard>("dashboard-data", {
  status: "unconfigured",
  generatedAt: new Date().toISOString(),
  errors: [],
  filters: { window: "last_7_days", accountKey: "all", commercialResidential: "all" },
  window: { start: "", end: "", label: "" },
  funnel: [],
  closeRate: { leadCount: 0, soldCount: 0, closeRate: 0, soldValue: 0, qualifier: "" },
  newLeadsCount: 0,
  marginByRegion: [],
  marginByOffice: [],
  marginByCommercialResidential: [],
  marginByRep: [],
  leaderboard: [],
  locationRollup: [],
  arTotal: 0,
  freshness: [],
  pipelineValueTotal: 0,
});

const config = readEmbeddedJson<DashboardConfig>("dashboard-config", {
  acculynxJobBaseUrl: "https://proexteriors.acculynx.com/jobs",
});

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

// Semantic palette in fixed order (UI-SPEC.md Chart styling contract) — max 5-6 colors.
const CHART_PALETTE = ["#11133f", "#3b6b4c", "#0066cc", "#eaa221", "#c22326"];

// ---------------------------------------------------------------------------
// Chart.js mounts (client-side only — Pitfall 6). Canvases live inside a
// fixed-height `.epl-chart-wrap` div (CSS-constrained), so responsive +
// maintainAspectRatio:false cannot grow the surrounding card unboundedly
// (checkpoint rework directive 5 — the cards-never-stop-expanding bug).
// ---------------------------------------------------------------------------

let funnelChart: Chart | null = null;
let leaderboardChart: Chart | null = null;

function mountFunnelChart(stages: FunnelStage[]) {
  const canvas = document.getElementById("pipeline-funnel-chart") as HTMLCanvasElement | null;
  if (!canvas) return;

  const labels = stages.map((stage) => stage.milestone);
  const data = stages.map((stage) => stage.value);

  if (funnelChart) {
    funnelChart.data.labels = labels;
    funnelChart.data.datasets[0].data = data;
    funnelChart.update();
    return;
  }

  funnelChart = new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Pipeline value by stage",
          data,
          backgroundColor: CHART_PALETTE[0],
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
    },
  });
}

function mountLeaderboardChart(rows: LeaderboardRow[]) {
  const canvas = document.getElementById("pipeline-leaderboard-chart") as HTMLCanvasElement | null;
  if (!canvas) return;

  const top = rows.slice(0, 8);
  const labels = top.map((row) => row.salesperson);
  const data = top.map((row) => row.soldValue);

  if (leaderboardChart) {
    leaderboardChart.data.labels = labels;
    leaderboardChart.data.datasets[0].data = data;
    leaderboardChart.update();
    return;
  }

  leaderboardChart = new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Sold value by rep",
          data,
          backgroundColor: CHART_PALETTE[1],
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
    },
  });
}

function mountCharts(dashboard: ExecutivePipelineDashboard) {
  mountFunnelChart(dashboard.funnel);
  mountLeaderboardChart(dashboard.leaderboard);
}

// ---------------------------------------------------------------------------
// KPI-click -> scroll/highlight the relevant location rows (D-09 primary
// breakdown lives in the per-location expandable rows now, not a separate
// drill-down panel — checkpoint rework directive 6).
// ---------------------------------------------------------------------------

const locationsSection = document.querySelector<HTMLElement>("[data-locations-section]");

function highlightLocations() {
  if (!locationsSection) return;
  locationsSection.scrollIntoView({ behavior: "smooth", block: "start" });
  locationsSection.setAttribute("data-flash", "true");
  window.setTimeout(() => locationsSection.removeAttribute("data-flash"), 900);
}

const kpiCards = Array.from(document.querySelectorAll<HTMLElement>("[data-kpi]"));
for (const card of kpiCards) {
  card.addEventListener("click", () => highlightLocations());
  card.style.cursor = "pointer";
}

// ---------------------------------------------------------------------------
// Per-location on-demand job table (D-09 drill-down) — extends the .iv-office
// expandable-row pattern: expanding a row fetches its job-level table from
// /api/executive/pipeline.json?jobs=1&location=...&type=... and renders it via
// DOM nodes (textContent only — T-07-05, never innerHTML with AccuLynx free text).
// ---------------------------------------------------------------------------

const locationDetailsList = Array.from(document.querySelectorAll<HTMLDetailsElement>("[data-location-row]"));
const loadedLocations = new Set<string>();

function renderJobsTable(wrap: HTMLElement, jobs: JobDrillRow[]) {
  wrap.replaceChildren();

  if (jobs.length === 0) {
    const empty = document.createElement("p");
    empty.className = "epl-jobs-empty";
    empty.textContent = "No jobs match these filters";
    wrap.append(empty);
    return;
  }

  const table = document.createElement("table");
  table.className = "epl-jobs-table";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const label of ["Job", "Stage", "Rep", "Value", "AccuLynx"]) {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = label;
    headRow.append(th);
  }
  thead.append(headRow);
  table.append(thead);

  const tbody = document.createElement("tbody");
  for (const job of jobs) {
    const tr = document.createElement("tr");

    const jobCell = document.createElement("td");
    jobCell.textContent = job.jobName;

    const stageCell = document.createElement("td");
    stageCell.textContent = job.milestone;

    const repCell = document.createElement("td");
    repCell.textContent = job.salesperson;

    const valueCell = document.createElement("td");
    valueCell.className = "num";
    valueCell.textContent = formatCurrency(job.contractAmount);

    const linkCell = document.createElement("td");
    if (job.acculynxJobId) {
      const link = document.createElement("a");
      link.href = `${config.acculynxJobBaseUrl}/${job.acculynxJobId}`;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Open in AccuLynx";
      linkCell.append(link);
    } else {
      linkCell.textContent = "—";
    }

    tr.append(jobCell, stageCell, repCell, valueCell, linkCell);
    tbody.append(tr);
  }
  table.append(tbody);

  const tableWrap = document.createElement("div");
  tableWrap.className = "epl-jobs-table-wrap";
  tableWrap.append(table);
  wrap.append(tableWrap);
}

async function loadLocationJobs(details: HTMLDetailsElement) {
  const accountKey = details.dataset.accountKey;
  if (!accountKey) return;

  const wrap = details.querySelector<HTMLElement>("[data-jobs-wrap]");
  if (!wrap) return;

  if (loadedLocations.has(accountKey)) return;
  loadedLocations.add(accountKey);

  const loading = document.createElement("p");
  loading.className = "epl-jobs-loading";
  loading.textContent = "Loading jobs…";
  wrap.replaceChildren(loading);

  try {
    const params = new URLSearchParams({ jobs: "1", location: accountKey });
    if (currentDashboard.filters.commercialResidential && currentDashboard.filters.commercialResidential !== "all") {
      params.set("type", currentDashboard.filters.commercialResidential);
    }
    const response = await fetch(`/api/executive/pipeline.json?${params.toString()}`, {
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      loadedLocations.delete(accountKey);
      wrap.replaceChildren();
      const failed = document.createElement("p");
      failed.className = "epl-jobs-empty";
      failed.textContent = "Jobs are unavailable right now — try again shortly.";
      wrap.append(failed);
      return;
    }
    const result = (await response.json()) as { status: string; jobs: JobDrillRow[] };
    renderJobsTable(wrap, result.jobs ?? []);
  } catch {
    loadedLocations.delete(accountKey);
    wrap.replaceChildren();
    const failed = document.createElement("p");
    failed.className = "epl-jobs-empty";
    failed.textContent = "Jobs are unavailable right now — try again shortly.";
    wrap.append(failed);
  }
}

for (const details of locationDetailsList) {
  details.addEventListener("toggle", () => {
    if (details.open) void loadLocationJobs(details);
  });
}

// ---------------------------------------------------------------------------
// Global filter bar (D-13) — re-fetch /api/executive/pipeline.json on change
// ---------------------------------------------------------------------------

const filterForm = document.querySelector<HTMLFormElement>("[data-filter-bar]");
const kpiGrid = document.querySelector<HTMLElement>("[data-kpi-grid]");
const resetButton = document.querySelector<HTMLButtonElement>("[data-reset-filters]");
const statusText = document.querySelector<HTMLElement>("[data-status-text]");
const statusStrip = document.querySelector<HTMLElement>("[data-status-strip]");

function currentFilterParams(): URLSearchParams {
  const params = new URLSearchParams();
  if (!filterForm) return params;
  const formData = new FormData(filterForm);
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string" && value && value !== "all") {
      params.set(key, value);
    }
  }
  return params;
}

function updateKpiCard(kpi: string, value: string, sub?: string) {
  const valueEl = document.querySelector<HTMLElement>(`[data-kpi-val="${kpi}"]`);
  if (valueEl) valueEl.textContent = value;
  if (sub !== undefined) {
    const subEl = document.querySelector<HTMLElement>(`[data-kpi-sub="${kpi}"]`);
    if (subEl) subEl.textContent = sub;
  }
}

function updateStatusStrip(dashboard: ExecutivePipelineDashboard) {
  if (!statusText || !statusStrip) return;

  const readyBadges = dashboard.freshness.filter((badge) => badge.tone === "ready");
  const staleCount = dashboard.freshness.length - readyBadges.length;
  const oldest = dashboard.freshness.reduce<FreshnessBadge | null>((acc, badge) => {
    if (!badge.lastSyncAt) return acc;
    if (!acc || !acc.lastSyncAt) return badge;
    return new Date(badge.lastSyncAt) < new Date(acc.lastSyncAt) ? badge : acc;
  }, null);
  const oldestHours = oldest?.lastSyncAt ? Math.max(0, Math.floor((Date.now() - new Date(oldest.lastSyncAt).getTime()) / 3_600_000)) : null;

  const tone = staleCount === 0 ? "ready" : dashboard.freshness.some((b) => b.tone === "critical") ? "critical" : "review";
  statusStrip.setAttribute("data-tone", tone);

  statusText.textContent =
    dashboard.status === "live"
      ? `Data live${oldestHours !== null ? ` · oldest sync ${oldestHours}h ago` : ""}${
          staleCount > 0 ? ` · ${staleCount} location${staleCount === 1 ? "" : "s"} stale` : ""
        }`
      : "Data unavailable — showing the last successful load.";
}

function renderKpis(dashboard: ExecutivePipelineDashboard) {
  const closeRatePct = (dashboard.closeRate.closeRate * 100).toFixed(0);

  updateKpiCard("pipeline-value", formatCurrency(dashboard.pipelineValueTotal));
  updateKpiCard("sold-value", formatCurrency(dashboard.closeRate.soldValue));
  updateKpiCard("jobs-sold", String(dashboard.closeRate.soldCount), `${closeRatePct}% of jobs in ${dashboard.window.label} (period snapshot)`);
  updateKpiCard("close-rate", `${closeRatePct}%`);
  updateKpiCard("new-leads", String(dashboard.newLeadsCount));
  updateKpiCard("ar-outstanding", formatCurrency(dashboard.arTotal));

  const covered = dashboard.marginByRegion.reduce((sum, row) => sum + row.coverage.jobsWithCostData, 0);
  const total = dashboard.marginByRegion.reduce((sum, row) => sum + row.coverage.totalJobsInSlice, 0);
  const avgMargin =
    covered > 0 ? dashboard.marginByRegion.reduce((sum, row) => sum + row.marginPct * row.coverage.jobsWithCostData, 0) / covered : 0;
  updateKpiCard("margin", covered > 0 ? `${avgMargin.toFixed(0)}%` : "—", covered === 0 ? "No cost data available yet" : `${covered} of ${total} jobs have cost data`);
}

async function refetchDashboard(params: URLSearchParams, options: { preserveDrilldown?: boolean } = {}) {
  if (kpiGrid) kpiGrid.setAttribute("aria-busy", "true");

  try {
    const response = await fetch(`/api/executive/pipeline.json?${params.toString()}`, {
      headers: { accept: "application/json" },
    });
    if (!response.ok) return;

    const dashboard = (await response.json()) as ExecutivePipelineDashboard;
    currentDashboard = dashboard;
    mountCharts(dashboard);
    renderKpis(dashboard);
    updateStatusStrip(dashboard);

    // Silent poll and filter changes both re-render in place; the poll path
    // (preserveDrilldown) must NOT reset the user's active filters or close an
    // open drill-down (D-11 / UI-SPEC Auto-refresh & filter-change UX). Filter
    // changes DO invalidate the per-location job cache since the filter (type)
    // affects which jobs a location row would show.
    if (!options.preserveDrilldown) {
      loadedLocations.clear();
      for (const details of locationDetailsList) {
        if (details.open) void loadLocationJobs(details);
      }
    }
  } catch {
    // Network/parse failure: leave the last-good render in place (never crash the tab).
  } finally {
    if (kpiGrid) kpiGrid.removeAttribute("aria-busy");
  }
}

if (filterForm) {
  filterForm.addEventListener("change", () => {
    void refetchDashboard(currentFilterParams());
  });
}

if (resetButton) {
  resetButton.addEventListener("click", () => {
    if (!filterForm) return;
    filterForm.reset();
    for (const select of Array.from(filterForm.querySelectorAll<HTMLSelectElement>("select[data-filter]"))) {
      if (select.name === "window") continue; // window keeps its own default, not forced to "all"
      select.value = "all";
    }
    void refetchDashboard(currentFilterParams());
  });
}

// ---------------------------------------------------------------------------
// Silent auto-refresh poll (D-11) — conservative 5-minute cadence
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 5 * 60_000;

setInterval(() => {
  void refetchDashboard(currentFilterParams(), { preserveDrilldown: true });
}, POLL_INTERVAL_MS);

// ---------------------------------------------------------------------------
// Initial mount
// ---------------------------------------------------------------------------

mountCharts(currentDashboard);
