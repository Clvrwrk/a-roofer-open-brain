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

type QueueName = "leads" | "prospects" | "approved" | "invoiced" | "closed";

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
  closeRateSnapshot: number;
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

interface QueueValue {
  queue: QueueName;
  count: number;
  value: number | null;
}

interface LocationRollupRow {
  accountKey: string;
  pipelineValue: number;
  soldValue: number;
  soldCount: number;
  leadCount: number;
  arValue: number;
  queues: QueueValue[];
  closeRateSnapshot: number;
}

interface SegmentSplit {
  residential: number;
  commercial: number;
}

interface AverageTicketResult {
  residential: { avgTicket: number; count: number };
  commercial: { avgTicket: number; count: number };
}

interface ExecutivePipelineDashboard {
  status: "live" | "degraded" | "unconfigured";
  generatedAt: string;
  errors: string[];
  filters: { window: string; accountKey: string; commercialResidential: string; rep: string };
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
  pipelineValueSplit: SegmentSplit;
  soldValueSplit: SegmentSplit;
  jobsSoldSplit: SegmentSplit;
  newLeadsSplit: SegmentSplit;
  closeRateSplit: SegmentSplit;
  marginPctSplit: SegmentSplit;
  averageTicket: AverageTicketResult;
  knownReps: string[];
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

const EMPTY_SPLIT: SegmentSplit = { residential: 0, commercial: 0 };

let currentDashboard = readEmbeddedJson<ExecutivePipelineDashboard>("dashboard-data", {
  status: "unconfigured",
  generatedAt: new Date().toISOString(),
  errors: [],
  filters: { window: "last_7_days", accountKey: "all", commercialResidential: "all", rep: "all" },
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
  pipelineValueSplit: { ...EMPTY_SPLIT },
  soldValueSplit: { ...EMPTY_SPLIT },
  jobsSoldSplit: { ...EMPTY_SPLIT },
  newLeadsSplit: { ...EMPTY_SPLIT },
  closeRateSplit: { ...EMPTY_SPLIT },
  marginPctSplit: { ...EMPTY_SPLIT },
  averageTicket: { residential: { avgTicket: 0, count: 0 }, commercial: { avgTicket: 0, count: 0 } },
  knownReps: [],
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

// Checkpoint round 3, item 5: compact currency for chart ticks/data-labels and any
// secondary big number (queue values on account bars) — mirrors the pure
// formatCompactCurrency() in executive-pipeline.ts exactly so SSR and client-side
// re-renders never disagree on formatting.
function formatCompactCurrency(value: number): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);

  if (abs >= 1_000_000) {
    const millions = abs / 1_000_000;
    const rounded = Math.round(millions * 10) / 10;
    const label = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
    return `${sign}$${label}M`;
  }

  if (abs >= 1_000) {
    const thousands = Math.round(abs / 1_000);
    return `${sign}$${thousands}K`;
  }

  return `${sign}$${Math.round(abs)}`;
}

// Semantic palette in fixed order (UI-SPEC.md Chart styling contract) — max 5-6 colors.
const CHART_PALETTE = ["#11133f", "#3b6b4c", "#0066cc", "#eaa221", "#c22326"];

// ---------------------------------------------------------------------------
// Chart.js mounts (client-side only — Pitfall 6). Canvases live inside a
// fixed-height `.epl-chart-wrap` div (CSS-constrained), so responsive +
// maintainAspectRatio:false cannot grow the surrounding card unboundedly
// (checkpoint rework directive 5 — the cards-never-stop-expanding bug).
// Checkpoint round 3, item 5: axis ticks and tooltip labels use compact
// currency ($5K/$50K/$500K/$1M) — never full precision.
// ---------------------------------------------------------------------------

let funnelChart: Chart | null = null;
let leaderboardChart: Chart | null = null;

const COMPACT_CURRENCY_TICK = {
  callback(value: unknown) {
    return typeof value === "number" ? formatCompactCurrency(value) : value;
  },
};

const COMPACT_CURRENCY_TOOLTIP = {
  callbacks: {
    label(context: { dataset: { label?: string }; parsed: { x?: number; y?: number } }) {
      const raw = context.parsed.x ?? context.parsed.y ?? 0;
      const label = context.dataset.label ? `${context.dataset.label}: ` : "";
      return `${label}${formatCompactCurrency(raw)}`;
    },
  },
};

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
      scales: { x: { ticks: COMPACT_CURRENCY_TICK } },
      plugins: { legend: { display: false }, tooltip: COMPACT_CURRENCY_TOOLTIP },
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
      scales: { y: { ticks: COMPACT_CURRENCY_TICK } },
      plugins: { legend: { display: false }, tooltip: COMPACT_CURRENCY_TOOLTIP },
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
// /api/executive/pipeline.json?jobs=1&location=...&type=...&rep=... and renders it
// via DOM nodes (textContent only — T-07-05, never innerHTML with AccuLynx free text).
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
    if (currentDashboard.filters.rep && currentDashboard.filters.rep !== "all") {
      params.set("rep", currentDashboard.filters.rep);
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
const locationsList = document.querySelector<HTMLElement>("[data-locations-list]");

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

function updateKpiSplit(kpi: string, split: SegmentSplit, formatter: (value: number) => string) {
  const resEl = document.querySelector<HTMLElement>(`[data-kpi-split="${kpi}-residential"]`);
  if (resEl) resEl.textContent = formatter(split.residential);
  const comEl = document.querySelector<HTMLElement>(`[data-kpi-split="${kpi}-commercial"]`);
  if (comEl) comEl.textContent = formatter(split.commercial);
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
  updateKpiCard("pipeline-value", formatCurrency(dashboard.pipelineValueTotal));
  updateKpiSplit("pipeline-value", dashboard.pipelineValueSplit, formatCompactCurrency);

  updateKpiCard("sold-value", formatCurrency(dashboard.closeRate.soldValue));
  updateKpiSplit("sold-value", dashboard.soldValueSplit, formatCompactCurrency);

  updateKpiCard("jobs-sold", String(dashboard.closeRate.soldCount), `${dashboard.window.label} (period snapshot)`);
  updateKpiSplit("jobs-sold", dashboard.jobsSoldSplit, (value) => String(value));

  const overallCloseRatePct = (((dashboard.closeRateSplit.residential + dashboard.closeRateSplit.commercial) / 2) * 100).toFixed(0);
  updateKpiCard("close-rate", `${overallCloseRatePct}%`);
  updateKpiSplit("close-rate", dashboard.closeRateSplit, (value) => `${(value * 100).toFixed(0)}%`);

  updateKpiCard("new-leads", String(dashboard.newLeadsCount));
  updateKpiSplit("new-leads", dashboard.newLeadsSplit, (value) => String(value));

  updateKpiCard("ar-outstanding", formatCurrency(dashboard.arTotal));

  const covered = dashboard.marginByRegion.reduce((sum, row) => sum + row.coverage.jobsWithCostData, 0);
  const total = dashboard.marginByRegion.reduce((sum, row) => sum + row.coverage.totalJobsInSlice, 0);
  const avgMargin =
    covered > 0 ? dashboard.marginByRegion.reduce((sum, row) => sum + row.marginPct * row.coverage.jobsWithCostData, 0) / covered : 0;
  updateKpiCard("margin", covered > 0 ? `${avgMargin.toFixed(0)}%` : "—", covered === 0 ? "No cost data available yet" : `${covered} of ${total} jobs have cost data`);
  updateKpiSplit("margin", dashboard.marginPctSplit, (value) => `${value.toFixed(0)}%`);

  const averageTicketHeadline = dashboard.averageTicket.residential.avgTicket || dashboard.averageTicket.commercial.avgTicket;
  updateKpiCard("average-ticket", formatCurrency(averageTicketHeadline));
  updateKpiSplit(
    "average-ticket",
    { residential: dashboard.averageTicket.residential.avgTicket, commercial: dashboard.averageTicket.commercial.avgTicket },
    formatCompactCurrency,
  );
}

// Checkpoint round 3, item 3/7: the per-location account bar rows carry queue
// values + a snapshot close rate that change on every filter/poll refresh, so they
// need a full DOM rebuild (unlike the flat KPI text nodes above). Rebuilds preserve
// each row's open/closed <details> state and DOES NOT touch the lazy-loaded jobs
// table inside an already-open row (that table is refreshed separately by
// refetchDashboard's loadLocationJobs call for open rows).
const QUEUE_LABELS: Record<QueueName, string> = {
  leads: "Leads",
  prospects: "Prospects",
  approved: "Approved",
  invoiced: "Invoiced",
  closed: "Closed",
};
const QUEUE_ORDER: QueueName[] = ["leads", "prospects", "approved", "invoiced", "closed"];

function renderLocationRows(dashboard: ExecutivePipelineDashboard) {
  if (!locationsList) return;

  const marginByAccount = new Map(dashboard.marginByRegion.map((row) => [row.dimension, row]));
  const rollupByAccount = new Map(dashboard.locationRollup.map((row) => [row.accountKey, row]));
  const freshnessByAccount = new Map(dashboard.freshness.map((badge) => [badge.accountKey, badge]));

  const openState = new Map<string, boolean>();
  for (const details of locationDetailsList) {
    if (details.dataset.accountKey) openState.set(details.dataset.accountKey, details.open);
  }

  for (const details of locationDetailsList) {
    const accountKey = details.dataset.accountKey;
    if (!accountKey) continue;

    const rollup = rollupByAccount.get(accountKey);
    const margin = marginByAccount.get(accountKey);
    const freshness = freshnessByAccount.get(accountKey);
    const stale = freshness ? freshness.tone !== "ready" : false;

    const staleMarker = details.querySelector<HTMLElement>(".epl-stale-marker");
    if (stale && !staleMarker) {
      const marker = document.createElement("span");
      marker.className = "epl-stale-marker";
      marker.textContent = "stale";
      details.querySelector(".epl-location-name")?.after(marker);
    } else if (!stale && staleMarker) {
      staleMarker.remove();
    }

    const queuesByName = new Map((rollup?.queues ?? []).map((q) => [q.queue, q]));
    const queuesWrap = details.querySelector<HTMLElement>(".epl-queues");
    if (queuesWrap) {
      queuesWrap.replaceChildren();
      for (const queue of QUEUE_ORDER) {
        const q = queuesByName.get(queue);
        const count = q?.count ?? 0;
        const value = q?.value ?? (queue === "leads" ? null : 0);

        const span = document.createElement("span");
        span.className = "epl-queue";
        span.dataset.queue = queue;

        const strong = document.createElement("strong");
        strong.textContent = value === null ? String(count) : formatCompactCurrency(value);

        const label = document.createElement("span");
        label.textContent = `${QUEUE_LABELS[queue]}${value !== null ? ` (${count})` : ""}`;

        span.append(strong, label);
        queuesWrap.append(span);
      }
    }

    const closeRatePct = (((rollup?.closeRateSnapshot ?? 0) * 100)).toFixed(0);
    const marginPct = margin?.marginPct ?? 0;
    const coverageLabel = margin
      ? margin.coverage.jobsWithCostData > 0
        ? `${margin.coverage.jobsWithCostData}/${margin.coverage.totalJobsInSlice}`
        : "no cost data"
      : "no data";
    const marginDisplay = coverageLabel === "no cost data" || coverageLabel === "no data" ? "—" : `${marginPct.toFixed(0)}%`;

    const miniItems = details.querySelectorAll<HTMLElement>(".epl-mini > div");
    if (miniItems[0]) {
      const strong = miniItems[0].querySelector("strong");
      if (strong) strong.textContent = `${closeRatePct}%`;
    }
    if (miniItems[1]) {
      const strong = miniItems[1].querySelector("strong");
      const span = miniItems[1].querySelector("span");
      if (strong) strong.textContent = marginDisplay;
      if (span) span.textContent = `Margin · ${coverageLabel}`;
    }
    if (miniItems[2]) {
      const strong = miniItems[2].querySelector("strong");
      if (strong) strong.textContent = formatCurrency(rollup?.arValue ?? 0);
    }

    const barFill = details.querySelector<HTMLElement>(".epl-bar-fill");
    if (barFill) barFill.style.width = `${Math.max(0, Math.min(100, marginPct))}%`;
    const bar = details.querySelector<HTMLElement>(".epl-bar");
    if (bar) bar.title = `${marginPct.toFixed(0)}% margin`;

    // Preserve open/closed state — never force-collapse on a filter change/poll.
    details.open = openState.get(accountKey) ?? details.open;
  }
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
    renderLocationRows(dashboard);

    // Silent poll and filter changes both re-render in place; the poll path
    // (preserveDrilldown) must NOT reset the user's active filters or close an
    // open drill-down (D-11 / UI-SPEC Auto-refresh & filter-change UX). Filter
    // changes DO invalidate the per-location job cache since the filter (type/rep)
    // affects which jobs a location row would show.
    if (!options.preserveDrilldown) {
      loadedLocations.clear();
      for (const details of locationDetailsList) {
        if (details.open) void loadLocationJobs(details);
      }
    } else {
      // Poll path: refresh the job table of any already-open row in place (the
      // aggregate KPIs/queues just changed above; the open drill-down should stay
      // current too), without resetting which rows are open.
      for (const details of locationDetailsList) {
        if (details.open && details.dataset.accountKey) {
          loadedLocations.delete(details.dataset.accountKey);
          void loadLocationJobs(details);
        }
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
