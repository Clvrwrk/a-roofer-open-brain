type WorkRow = HTMLTableRowElement & {
  dataset: DOMStringMap & {
    workId: string;
    title: string;
    owner: string;
    status: string;
    approval: string;
    evidence: string;
    action: string;
    detail: string;
    audit: string;
    department: string;
    cadence: string;
  };
};

const rows = Array.from(document.querySelectorAll<WorkRow>("[data-work-row]"));
const cadenceButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-cadence-filter]"));
const departmentFilter = document.querySelector<HTMLSelectElement>("[data-department-filter]");
const title = document.querySelector<HTMLElement>("[data-detail-title]");
const status = document.querySelector<HTMLElement>("[data-detail-status]");
const owner = document.querySelector<HTMLElement>("[data-detail-owner]");
const approval = document.querySelector<HTMLElement>("[data-detail-approval]");
const evidence = document.querySelector<HTMLElement>("[data-detail-evidence]");
const copy = document.querySelector<HTMLElement>("[data-detail-copy]");
const audit = document.querySelector<HTMLOListElement>("[data-detail-audit]");
const note = document.querySelector<HTMLElement>("[data-action-note]");

let activeCadence = "all";

function selectRow(row: WorkRow) {
  rows.forEach((candidate) => candidate.classList.toggle("is-selected", candidate === row));

  if (title) title.textContent = row.dataset.title;
  if (status) {
    status.textContent = row.dataset.status;
    status.className = `status-badge status-${row.dataset.status.replace(" ", "_")}`;
  }
  if (owner) owner.textContent = row.dataset.owner;
  if (approval) approval.textContent = row.dataset.approval;
  if (evidence) evidence.textContent = row.dataset.evidence;
  if (copy) copy.textContent = row.dataset.detail;
  if (audit) {
    audit.replaceChildren(
      ...row.dataset.audit.split("|").map((item) => {
        const element = document.createElement("li");
        element.textContent = item;
        return element;
      }),
    );
  }
  if (note) {
    note.textContent = `${row.dataset.action} selected for ${row.dataset.owner}. Phase 1 stores this interaction locally.`;
  }
}

function applyFilters() {
  const activeDepartment = departmentFilter?.value ?? "all";
  let firstVisible: WorkRow | undefined;

  rows.forEach((row) => {
    const cadenceMatches = activeCadence === "all" || row.dataset.cadence === activeCadence;
    const departmentMatches = activeDepartment === "all" || row.dataset.department === activeDepartment;
    const visible = cadenceMatches && departmentMatches;
    row.hidden = !visible;
    if (visible && !firstVisible) firstVisible = row;
  });

  if (firstVisible) selectRow(firstVisible);
}

rows.forEach((row) => {
  row.addEventListener("click", () => selectRow(row));
  row.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectRow(row);
    }
  });
});

cadenceButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activeCadence = button.dataset.cadenceFilter ?? "all";
    cadenceButtons.forEach((candidate) => candidate.classList.toggle("is-active", candidate === button));
    applyFilters();
  });
});

departmentFilter?.addEventListener("change", applyFilters);

document.querySelectorAll<HTMLButtonElement>("[data-approval-action]").forEach((button) => {
  button.addEventListener("click", () => {
    const selected = rows.find((row) => row.classList.contains("is-selected"));
    if (!selected || !note) return;

    const action = button.dataset.approvalAction === "approve" ? "Approval" : "Rejection";
    note.textContent = `${action} recorded locally for ${selected.dataset.title}. Live audit writes arrive with the cadence engine.`;
  });
});

applyFilters();
