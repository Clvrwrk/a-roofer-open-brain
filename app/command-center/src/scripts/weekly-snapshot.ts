interface DashboardRecord {
  id: string;
  type: string;
  label: string;
  sublabel: string;
  value: string;
  status: string;
  href: string;
}

const triggers = Array.from(document.querySelectorAll<HTMLElement>("[data-drilldown]"));
const dashboardTitle = document.querySelector<HTMLElement>("[data-dashboard-title]");
const dashboardValue = document.querySelector<HTMLElement>("[data-dashboard-value]");
const dashboardCaption = document.querySelector<HTMLElement>("[data-dashboard-caption]");
const dashboardCount = document.querySelector<HTMLElement>("[data-dashboard-count]");
const dashboardRows = document.querySelector<HTMLTableSectionElement>("[data-dashboard-rows]");
const dashboardLink = document.querySelector<HTMLAnchorElement>("[data-dashboard-link]");

function parseRecords(trigger: HTMLElement): DashboardRecord[] {
  try {
    const records = JSON.parse(trigger.dataset.records ?? "[]") as DashboardRecord[];
    return Array.isArray(records) ? records : [];
  } catch {
    return [];
  }
}

function makeCell(text: string) {
  const cell = document.createElement("td");
  cell.textContent = text;
  return cell;
}

function renderRows(records: DashboardRecord[]) {
  if (!dashboardRows) return;
  dashboardRows.replaceChildren();

  if (records.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 4;
    cell.textContent = "No records are available for this slice yet.";
    row.append(cell);
    dashboardRows.append(row);
    return;
  }

  for (const record of records) {
    const row = document.createElement("tr");
    const type = makeCell(record.type);
    const label = document.createElement("td");
    const link = document.createElement("a");
    const sublabel = document.createElement("span");

    link.href = record.href || "/weekly-snapshot#snapshot-dashboard";
    link.textContent = record.label || "Untitled record";
    sublabel.textContent = record.sublabel || "No additional detail";
    label.append(link, sublabel);

    row.append(type, label, makeCell(record.value || "No value"), makeCell(record.status || "pending"));
    dashboardRows.append(row);
  }
}

function activate(trigger: HTMLElement, updateHistory = true) {
  const records = parseRecords(trigger);
  const title = trigger.dataset.title ?? "Weekly Snapshot";
  const value = trigger.dataset.value ?? "";
  const caption = trigger.dataset.caption ?? "Filtered dashboard";
  const href = trigger.getAttribute("href") ?? "/weekly-snapshot#snapshot-dashboard";

  for (const item of triggers) item.removeAttribute("aria-current");
  trigger.setAttribute("aria-current", "true");

  if (dashboardTitle) dashboardTitle.textContent = title;
  if (dashboardValue) dashboardValue.textContent = value;
  if (dashboardCaption) dashboardCaption.textContent = caption;
  if (dashboardCount) dashboardCount.textContent = String(records.length);
  if (dashboardLink) dashboardLink.href = href;
  renderRows(records);

  if (updateHistory) {
    window.history.replaceState(null, "", href);
  }
}

function initialTrigger() {
  const params = new URLSearchParams(window.location.search);
  const record = params.get("record") ?? params.get("claim") ?? params.get("activity") ?? params.get("payment");
  if (record) {
    const match = triggers.find((trigger) => parseRecords(trigger).some((item) => item.id === record));
    if (match) return match;
  }

  const metric = params.get("metric");
  if (metric) {
    const match = triggers.find((trigger) => trigger.getAttribute("href")?.includes(`metric=${metric}`));
    if (match) return match;
  }

  return triggers.find((trigger) => parseRecords(trigger).length > 0) ?? triggers[0];
}

for (const trigger of triggers) {
  trigger.addEventListener("mouseenter", () => activate(trigger, false));
  trigger.addEventListener("focus", () => activate(trigger, false));
}

const first = initialTrigger();
if (first) activate(first, false);
