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
  arTotal: number;
  freshness: FreshnessBadge[];
  pipelineValueTotal: number;
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
// Chart.js mounts (client-side only — Pitfall 6)
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

  const top = rows.slice(0, 10);
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
// Two-level drill-down (D-09) — extends weekly-snapshot.ts's activate() pattern
// ---------------------------------------------------------------------------

const dashboardTitle = document.querySelector<HTMLElement>("[data-dashboard-title]");
const dashboardValue = document.querySelector<HTMLElement>("[data-dashboard-value]");
const dashboardCaption = document.querySelector<HTMLElement>("[data-dashboard-caption]");
const dashboardCount = document.querySelector<HTMLElement>("[data-dashboard-count]");
const dashboardRows = document.querySelector<HTMLTableSectionElement>("[data-dashboard-rows]");

function parseDrillTarget(trigger: HTMLElement): { dimension: string; source: string } | null {
  try {
    const parsed = JSON.parse(trigger.dataset.records ?? "null");
    if (parsed && typeof parsed === "object" && "dimension" in parsed) {
      return parsed as { dimension: string; source: string };
    }
    return null;
  } catch {
    return null;
  }
}

interface DrillJobRow {
  jobName: string;
  location: string;
  stage: string;
  value: string;
  acculynxJobId: string | null;
}

// The dashboard payload doesn't currently carry raw per-job rows to the client
// (only aggregates) — the leaderboard array carries salesperson-level rows we
// can render directly; for dimension-based breakdown clicks we render an
// honest empty-state until a future plan wires per-job row passthrough. Never
// fabricate synthetic job rows from aggregate data.
function rowsForLeaderboard(row: LeaderboardRow): DrillJobRow[] {
  return [
    {
      jobName: row.salesperson,
      location: "—",
      stage: "sold (window)",
      value: formatCurrency(row.soldValue),
      acculynxJobId: null,
    },
  ];
}

function renderDrillRows(rows: DrillJobRow[]) {
  if (!dashboardRows) return;
  dashboardRows.replaceChildren();

  if (rows.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 5;
    cell.textContent = "No jobs match these filters";
    row.append(cell);
    dashboardRows.append(row);
    return;
  }

  for (const record of rows) {
    const tr = document.createElement("tr");

    const jobCell = document.createElement("td");
    jobCell.textContent = record.jobName;

    const locationCell = document.createElement("td");
    locationCell.textContent = record.location;

    const stageCell = document.createElement("td");
    stageCell.textContent = record.stage;

    const valueCell = document.createElement("td");
    valueCell.textContent = record.value;

    const linkCell = document.createElement("td");
    if (record.acculynxJobId) {
      const link = document.createElement("a");
      link.href = `${config.acculynxJobBaseUrl}/${record.acculynxJobId}`;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      // Untrusted AccuLynx free text renders via textContent only — never innerHTML.
      link.textContent = "Open in AccuLynx";
      linkCell.append(link);
    } else {
      linkCell.textContent = "—";
    }

    tr.append(jobCell, locationCell, stageCell, valueCell, linkCell);
    dashboardRows.append(tr);
  }
}

const triggers = Array.from(document.querySelectorAll<HTMLElement>("[data-drilldown]"));

function activateTrigger(trigger: HTMLElement) {
  const title = trigger.dataset.title ?? "Pipeline value by stage";
  const value = trigger.dataset.value ?? "";
  const caption = trigger.dataset.caption ?? "Filtered dashboard";
  const target = parseDrillTarget(trigger);

  for (const item of triggers) item.removeAttribute("aria-current");
  trigger.setAttribute("aria-current", "true");

  if (dashboardTitle) dashboardTitle.textContent = title;
  if (dashboardValue) dashboardValue.textContent = value;
  if (dashboardCaption) dashboardCaption.textContent = caption;

  let rows: DrillJobRow[] = [];
  if (target?.source === "leaderboard" || trigger.dataset.kpi === "leaderboard") {
    rows = currentDashboard.leaderboard.flatMap(rowsForLeaderboard);
  }

  if (dashboardCount) dashboardCount.textContent = String(rows.length);
  renderDrillRows(rows);
}

for (const trigger of triggers) {
  trigger.addEventListener("click", (event) => {
    // KPI/chart-segment triggers stay on-page (in-place drill-down swap) — never
    // a full navigation/reload (D-11, UI-SPEC Auto-refresh & filter-change UX).
    event.preventDefault();
    activateTrigger(trigger);
  });
}

// ---------------------------------------------------------------------------
// Global filter bar (D-13) — re-fetch /api/executive/pipeline.json on change
// ---------------------------------------------------------------------------

const filterForm = document.querySelector<HTMLFormElement>("[data-filter-bar]");
const kpiGrid = document.querySelector<HTMLElement>("[data-kpi-grid]");
const resetButton = document.querySelector<HTMLButtonElement>("[data-reset-filters]");

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

    // Silent poll and filter changes both re-render in place; the poll path
    // (preserveDrilldown) must NOT reset the user's active filters or close an
    // open drill-down (D-11 / UI-SPEC Auto-refresh & filter-change UX).
    if (!options.preserveDrilldown) {
      window.location.hash = "";
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
