// Price Foundation — Review Queues working screen.
// Tabs + client-side filtering over the hydrated window, a detail side panel, and
// resolve/reject/defer writes to the review API. Source rows stay canonical; this
// only records the resolution overlay.

type Detail = {
  reviewKey: string;
  queue: "sku" | "branch" | "business_rule";
  sourceTable: string;
  sourcePk: string;
  rawItemNumber: string | null;
  rawDescription: string | null;
  rawBranchNumber: string | null;
  ruleName: string | null;
  problemCategory: string;
  problemLabel: string;
  candidate: string | null;
  proposedResolution: string;
  unitPrice: number | null;
  resolutionStatus: "open" | "resolved" | "rejected" | "deferred";
  resolution: string | null;
  note: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string | null;
};

const root = document.querySelector<HTMLElement>(".pf-queues");
const canEdit = root?.dataset.canEdit === "true";

const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-pf-tab]"));
const panels = Array.from(document.querySelectorAll<HTMLElement>("[data-pf-panel]"));
const statusBoxes = Array.from(document.querySelectorAll<HTMLInputElement>("[data-pf-status]"));
const problemSelect = document.querySelector<HTMLSelectElement>("[data-pf-problem]");
const searchInput = document.querySelector<HTMLInputElement>("[data-pf-search]");

const detailEmpty = document.querySelector<HTMLElement>("[data-pf-empty]");
const detailBody = document.querySelector<HTMLElement>("[data-pf-body]");
const detailStatus = document.querySelector<HTMLElement>("[data-pf-detail-status]");
const detailTitle = document.querySelector<HTMLElement>("[data-pf-detail-title]");
const detailFields = document.querySelector<HTMLDListElement>("[data-pf-detail-fields]");
const detailProposed = document.querySelector<HTMLElement>("[data-pf-detail-proposed]");

const resolutionInput = document.querySelector<HTMLInputElement>("[data-pf-resolution]");
const deferField = document.querySelector<HTMLElement>("[data-pf-defer-field]");
const deferInput = document.querySelector<HTMLInputElement>("[data-pf-defer]");
const noteInput = document.querySelector<HTMLTextAreaElement>("[data-pf-note]");
const actionStatus = document.querySelector<HTMLElement>("[data-pf-action-status]");
const actionButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-pf-action]"));

const PROBLEM_LABELS: Record<string, string> = {
  missing_item_number: "Missing item number",
  sku_not_in_catalog: "SKU not in catalog",
  pending_approval: "Pending approval",
  unverified_branch_match: "Unverified branch match",
};

let activeQueue = (tabs.find((t) => t.classList.contains("is-active"))?.dataset.pfTab ?? "sku") as Detail["queue"];
let selectedRow: HTMLTableRowElement | null = null;

function activePanel() {
  return panels.find((panel) => panel.dataset.pfPanel === activeQueue) ?? null;
}

function activeRows() {
  return Array.from(activePanel()?.querySelectorAll<HTMLTableRowElement>("[data-pf-row]") ?? []);
}

function selectedStatuses() {
  return new Set(statusBoxes.filter((box) => box.checked).map((box) => box.dataset.pfStatus));
}

function rebuildProblemOptions() {
  if (!problemSelect) return;
  const cats = new Set<string>();
  activeRows().forEach((row) => row.dataset.problem && cats.add(row.dataset.problem));
  const previous = problemSelect.value;
  problemSelect.innerHTML = "";
  const all = document.createElement("option");
  all.value = "all";
  all.textContent = "All";
  problemSelect.append(all);
  Array.from(cats)
    .sort()
    .forEach((cat) => {
      const option = document.createElement("option");
      option.value = cat;
      option.textContent = PROBLEM_LABELS[cat] ?? cat.replace(/_/g, " ");
      problemSelect.append(option);
    });
  problemSelect.value = Array.from(problemSelect.options).some((o) => o.value === previous) ? previous : "all";
}

function applyFilters() {
  const statuses = selectedStatuses();
  const problem = problemSelect?.value ?? "all";
  const term = (searchInput?.value ?? "").trim().toLowerCase();
  const panel = activePanel();
  if (!panel) return;

  let visible = 0;
  activeRows().forEach((row) => {
    const statusOk = statuses.size === 0 || statuses.has(row.dataset.status);
    const problemOk = problem === "all" || row.dataset.problem === problem;
    const searchOk = !term || (row.dataset.search ?? "").includes(term);
    const show = statusOk && problemOk && searchOk;
    row.hidden = !show;
    if (show) visible += 1;
  });

  const counter = panel.querySelector<HTMLElement>("[data-pf-visible-count]");
  if (counter) counter.textContent = visible.toLocaleString("en-US");
}

function switchTab(queue: Detail["queue"]) {
  activeQueue = queue;
  tabs.forEach((tab) => {
    const isActive = tab.dataset.pfTab === queue;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", isActive ? "true" : "false");
  });
  panels.forEach((panel) => {
    panel.hidden = panel.dataset.pfPanel !== queue;
  });
  clearSelection();
  rebuildProblemOptions();
  applyFilters();
}

function clearSelection() {
  selectedRow = null;
  activeRows().forEach((row) => row.classList.remove("is-selected"));
  if (detailBody) detailBody.hidden = true;
  if (detailEmpty) detailEmpty.hidden = false;
}

function field(term: string, value: string) {
  const wrap = document.createElement("div");
  const dt = document.createElement("dt");
  const dd = document.createElement("dd");
  dt.textContent = term;
  dd.textContent = value;
  wrap.append(dt, dd);
  return wrap;
}

function money(value: number | null) {
  if (value === null) return "—";
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function renderDetail(row: HTMLTableRowElement) {
  let detail: Detail;
  try {
    detail = JSON.parse(row.dataset.detail ?? "{}") as Detail;
  } catch {
    return;
  }

  if (detailEmpty) detailEmpty.hidden = true;
  if (detailBody) detailBody.hidden = false;

  if (detailStatus) {
    detailStatus.textContent = detail.resolutionStatus;
    detailStatus.className = `status-badge pf-status-${detail.resolutionStatus}`;
  }
  if (detailTitle) {
    detailTitle.textContent =
      detail.queue === "branch"
        ? `Branch ${detail.rawBranchNumber ?? "?"}`
        : detail.rawItemNumber || detail.rawDescription || `Record #${detail.sourcePk}`;
  }

  if (detailFields) {
    detailFields.replaceChildren();
    detailFields.append(field("Review key", detail.reviewKey));
    detailFields.append(field("Source", `${detail.sourceTable} · #${detail.sourcePk}`));
    detailFields.append(field("Problem", detail.problemLabel));
    if (detail.queue === "branch") {
      detailFields.append(field("Branch number", detail.rawBranchNumber ?? "—"));
      detailFields.append(field("Candidate", detail.candidate ?? "—"));
    } else {
      detailFields.append(field("Item number", detail.rawItemNumber ?? "—"));
      detailFields.append(field("Description", detail.rawDescription ?? "—"));
      detailFields.append(field("Unit price", money(detail.unitPrice)));
    }
    if (detail.ruleName) detailFields.append(field("Rule", detail.ruleName));
    if (detail.reviewedBy) {
      detailFields.append(field("Reviewed by", detail.reviewedBy));
    }
    if (detail.note) detailFields.append(field("Last note", detail.note));
  }

  if (detailProposed) detailProposed.textContent = detail.proposedResolution;
  if (resolutionInput) resolutionInput.value = detail.resolution ?? "";
  if (noteInput) noteInput.value = "";
  if (deferField) deferField.hidden = true;
  if (actionStatus) actionStatus.textContent = "";
}

function selectRow(row: HTMLTableRowElement) {
  selectedRow = row;
  activeRows().forEach((candidate) => candidate.classList.toggle("is-selected", candidate === row));
  renderDetail(row);
}

async function submitDecision(status: string) {
  if (!selectedRow || !actionStatus) return;

  if (status === "deferred" && deferField?.hidden) {
    deferField.hidden = false;
    deferInput?.focus();
    actionStatus.textContent = "Pick a defer-until date, then click Defer again.";
    return;
  }

  const payload = {
    queue: selectedRow.dataset.queue,
    sourceTable: selectedRow.dataset.sourceTable,
    sourcePk: selectedRow.dataset.sourcePk,
    problemCategory: selectedRow.dataset.problem,
    status,
    resolution: resolutionInput?.value.trim() || null,
    note: noteInput?.value.trim() || null,
    deferUntil: status === "deferred" ? deferInput?.value || null : null,
  };

  actionButtons.forEach((button) => (button.disabled = true));
  actionStatus.textContent = "Saving decision…";

  try {
    const response = await fetch("/api/data-quality/price-foundation/review", {
      body: JSON.stringify(payload),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const result = await response.json();
    if (!response.ok) {
      actionStatus.textContent = result.error_description ?? result.error ?? "Decision failed.";
      return;
    }

    // Update the row in place and re-apply filters (a resolved row may drop out).
    selectedRow.dataset.status = String(status);
    const badge = selectedRow.querySelector<HTMLElement>("[data-pf-status-badge]");
    if (badge) {
      badge.textContent = String(status);
      badge.className = `status-badge pf-status-${status} `.trim() + " ";
      badge.classList.add(`pf-status-${status}`);
    }
    const detail = JSON.parse(selectedRow.dataset.detail ?? "{}");
    detail.resolutionStatus = status;
    detail.resolution = payload.resolution;
    detail.note = payload.note;
    selectedRow.dataset.detail = JSON.stringify(detail);

    if (detailStatus) {
      detailStatus.textContent = String(status);
      detailStatus.className = `status-badge pf-status-${status}`;
    }
    actionStatus.textContent = `Saved. Action id: ${result.action?.id ?? "recorded"}.`;
    applyFilters();
  } catch (error) {
    actionStatus.textContent = error instanceof Error ? error.message : "Decision failed.";
  } finally {
    actionButtons.forEach((button) => (button.disabled = false));
  }
}

// wiring
tabs.forEach((tab) =>
  tab.addEventListener("click", () => switchTab(tab.dataset.pfTab as Detail["queue"])),
);
statusBoxes.forEach((box) => box.addEventListener("change", applyFilters));
problemSelect?.addEventListener("change", applyFilters);
searchInput?.addEventListener("input", applyFilters);

panels.forEach((panel) => {
  panel.addEventListener("click", (event) => {
    const row = event.target instanceof Element ? event.target.closest<HTMLTableRowElement>("[data-pf-row]") : null;
    if (row) selectRow(row);
  });
  panel.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const row = event.target instanceof Element ? event.target.closest<HTMLTableRowElement>("[data-pf-row]") : null;
    if (row) {
      event.preventDefault();
      selectRow(row);
    }
  });
});

if (canEdit) {
  actionButtons.forEach((button) =>
    button.addEventListener("click", () => submitDecision(button.dataset.pfAction ?? "")),
  );
}

rebuildProblemOptions();
applyFilters();
