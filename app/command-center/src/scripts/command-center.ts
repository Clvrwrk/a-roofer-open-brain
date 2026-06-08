type WorkRow = HTMLTableRowElement & {
  dataset: DOMStringMap & {
    workId?: string;
    workKey?: string;
    title: string;
    owner: string;
    human?: string;
    status: string;
    priority?: string;
    approval: string;
    evidence: string;
    action: string;
    detail: string;
    audit: string;
    department: string;
    cadence: string;
    source?: string;
    href?: string;
    stuck?: string;
    recommendation?: string;
    requiredResponse?: string;
    nextStep?: string;
    actions?: string;
    transparency?: string;
  };
};

type ActionPayload = {
  label: string;
  decision: string;
  intent: string;
  outcome?: string;
  tone?: "primary" | "secondary" | "ghost" | "danger";
};

type TransparencyPayload = {
  label: string;
  value: string;
};

const rows = Array.from(document.querySelectorAll<WorkRow>("[data-work-row]"));
const cadenceButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-cadence-filter]"));
const departmentFilter = document.querySelector<HTMLSelectElement>("[data-department-filter]");
const title = document.querySelector<HTMLElement>("[data-detail-title]");
const status = document.querySelector<HTMLElement>("[data-detail-status]");
const owner = document.querySelector<HTMLElement>("[data-detail-owner]");
const human = document.querySelector<HTMLElement>("[data-detail-human]");
const approval = document.querySelector<HTMLElement>("[data-detail-approval]");
const source = document.querySelector<HTMLElement>("[data-detail-source]");
const evidence = document.querySelector<HTMLElement>("[data-detail-evidence]");
const copy = document.querySelector<HTMLElement>("[data-detail-copy]");
const audit = document.querySelector<HTMLOListElement>("[data-detail-audit]");
const note = document.querySelector<HTMLElement>("[data-action-note]");
const decisionNote = document.querySelector<HTMLTextAreaElement>("[data-decision-note]");
const detailLink = document.querySelector<HTMLAnchorElement>("[data-detail-link]");
const stuck = document.querySelector<HTMLElement>("[data-detail-stuck]");
const recommendation = document.querySelector<HTMLElement>("[data-detail-recommendation]");
const requiredResponse = document.querySelector<HTMLElement>("[data-detail-required-response]");
const nextStep = document.querySelector<HTMLElement>("[data-detail-next-step]");
const actionsContainer = document.querySelector<HTMLElement>("[data-unblocker-actions]");
const transparency = document.querySelector<HTMLElement>("[data-detail-transparency]");

let activeCadence = "all";

function parseJsonArray<T>(value: string | undefined): T[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function buttonClassForTone(tone: ActionPayload["tone"]) {
  if (tone === "primary") return "button button-primary";
  if (tone === "danger") return "button button-danger";
  if (tone === "ghost") return "button button-ghost";
  return "button button-secondary";
}

function renderActions(row: WorkRow) {
  if (!actionsContainer) return;
  const actions = parseJsonArray<ActionPayload>(row.dataset.actions);
  if (!actions.length) return;

  actionsContainer.replaceChildren(
    ...actions.map((action) => {
      const button = document.createElement("button");
      button.className = buttonClassForTone(action.tone);
      button.type = "button";
      button.dataset.liveDecision = action.decision;
      button.dataset.actionIntent = action.intent;
      button.dataset.actionLabel = action.label;
      button.dataset.actionNextStep = row.dataset.nextStep ?? "";
      button.title = action.outcome ?? "";
      button.textContent = action.label;
      return button;
    }),
  );
}

function renderTransparency(row: WorkRow) {
  if (!transparency) return;
  const facts = parseJsonArray<TransparencyPayload>(row.dataset.transparency);
  if (!facts.length) return;

  transparency.replaceChildren(
    ...facts.map((fact) => {
      const wrapper = document.createElement("div");
      const term = document.createElement("dt");
      const value = document.createElement("dd");
      term.textContent = fact.label;
      value.textContent = fact.value;
      wrapper.append(term, value);
      return wrapper;
    }),
  );
}

function selectRow(row: WorkRow) {
  rows.forEach((candidate) => candidate.classList.toggle("is-selected", candidate === row));

  if (title) title.textContent = row.dataset.title;
  if (status) {
    status.textContent = row.dataset.priority ?? row.dataset.status;
    status.className = row.dataset.priority
      ? `status-badge priority-${row.dataset.priority}`
      : `status-badge status-${row.dataset.status.replace(" ", "_")}`;
  }
  if (owner) owner.textContent = row.dataset.owner;
  if (human) human.textContent = row.dataset.human ?? row.dataset.owner;
  if (approval) approval.textContent = row.dataset.approval;
  if (source) source.textContent = row.dataset.source ?? "Live source";
  if (evidence) evidence.textContent = row.dataset.evidence;
  if (copy) copy.textContent = row.dataset.detail;
  if (stuck) stuck.textContent = row.dataset.stuck ?? row.dataset.detail;
  if (recommendation) recommendation.textContent = row.dataset.recommendation ?? row.dataset.action;
  if (requiredResponse) requiredResponse.textContent = row.dataset.requiredResponse ?? `Human response required from ${row.dataset.human ?? row.dataset.owner}.`;
  if (nextStep) nextStep.textContent = row.dataset.nextStep ?? "Owning agent continues after the dashboard action is recorded.";
  if (detailLink && row.dataset.href) detailLink.href = row.dataset.href;
  if (decisionNote) decisionNote.value = "";
  renderActions(row);
  renderTransparency(row);
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
    note.textContent = `${row.dataset.action} selected for ${row.dataset.human ?? row.dataset.owner}.`;
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

document.querySelectorAll<HTMLButtonElement>("[data-live-decision]").forEach((button) => {
  button.dataset.commandCenterBound = "legacy";
});

document.addEventListener("click", async (event) => {
  const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("[data-live-decision]") : null;
  if (!target || !note) return;

  const selected = rows.find((row) => row.classList.contains("is-selected"));
  if (!selected) return;

  const workKey = selected.dataset.workKey ?? selected.dataset.workId;
  if (!workKey) {
    note.textContent = "No work key is attached to this row.";
    return;
  }

  target.disabled = true;
  note.textContent = "Writing decision to Supabase...";

  try {
    const response = await fetch(`/api/agent/work-queue/${encodeURIComponent(workKey)}/decision`, {
      body: JSON.stringify({
        decision: target.dataset.liveDecision,
        intent: target.dataset.actionIntent ?? null,
        label: target.dataset.actionLabel ?? target.textContent?.trim() ?? null,
        nextStep: target.dataset.actionNextStep ?? selected.dataset.nextStep ?? null,
        note: decisionNote?.value.trim() || null,
      }),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    });
    const payload = await response.json();
    if (!response.ok) {
      note.textContent = payload.error_description ?? payload.error ?? "Decision write failed.";
      return;
    }
    const memory = payload.memory?.status ? ` Memory: ${payload.memory.status}.` : "";
    note.textContent = `Decision saved. Action id: ${payload.auditEvent?.id ?? payload.action?.id ?? "recorded"}.${memory}`;
  } catch (error) {
    note.textContent = error instanceof Error ? error.message : "Decision write failed.";
  } finally {
    target.disabled = false;
  }
});

applyFilters();
