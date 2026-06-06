type GapRow = HTMLTableRowElement & {
  dataset: DOMStringMap & {
    severity: string;
    branch: string;
    payment: string;
    search: string;
    title: string;
    branchLabel: string;
    gapReasons: string;
    action: string;
    escalation: string;
    past: string;
    current: string;
    reference: string;
    price: string;
    delta: string;
  };
};

const gapRows = Array.from(document.querySelectorAll<GapRow>("[data-gap-row]"));
const searchInput = document.querySelector<HTMLInputElement>("[data-gap-search]");
const severityFilter = document.querySelector<HTMLSelectElement>("[data-gap-severity]");
const branchFilter = document.querySelector<HTMLSelectElement>("[data-gap-branch]");
const paymentFilter = document.querySelector<HTMLSelectElement>("[data-gap-payment]");
const visibleCount = document.querySelector<HTMLElement>("[data-gap-visible-count]");
const detailTitle = document.querySelector<HTMLElement>("[data-gap-detail-title]");
const detailSeverity = document.querySelector<HTMLElement>("[data-gap-detail-severity]");
const detailBranch = document.querySelector<HTMLElement>("[data-gap-detail-branch]");
const detailPrice = document.querySelector<HTMLElement>("[data-gap-detail-price]");
const detailDelta = document.querySelector<HTMLElement>("[data-gap-detail-delta]");
const detailReasons = document.querySelector<HTMLUListElement>("[data-gap-detail-reasons]");
const detailPast = document.querySelector<HTMLElement>("[data-gap-detail-past]");
const detailCurrent = document.querySelector<HTMLElement>("[data-gap-detail-current]");
const detailAction = document.querySelector<HTMLElement>("[data-gap-detail-action]");
const detailEscalation = document.querySelector<HTMLElement>("[data-gap-detail-escalation]");

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function selectGapRow(row: GapRow) {
  gapRows.forEach((candidate) => candidate.classList.toggle("is-selected", candidate === row));

  if (detailTitle) detailTitle.textContent = row.dataset.title;
  if (detailSeverity) {
    detailSeverity.textContent = row.dataset.severity;
    detailSeverity.className = `status-badge gap-${row.dataset.severity}`;
  }
  if (detailBranch) detailBranch.textContent = row.dataset.branchLabel;
  if (detailPrice) detailPrice.textContent = row.dataset.price;
  if (detailDelta) detailDelta.textContent = row.dataset.delta;
  if (detailPast) detailPast.textContent = row.dataset.past;
  if (detailCurrent) detailCurrent.textContent = row.dataset.current;
  if (detailAction) detailAction.textContent = row.dataset.action;
  if (detailEscalation) detailEscalation.textContent = row.dataset.escalation;

  if (detailReasons) {
    detailReasons.replaceChildren(
      ...row.dataset.gapReasons.split("|").map((reason) => {
        const item = document.createElement("li");
        item.textContent = reason;
        return item;
      }),
    );
  }
}

function applyGapFilters() {
  const query = searchInput?.value.trim().toLowerCase() ?? "";
  const severity = severityFilter?.value ?? "all";
  const branch = branchFilter?.value ?? "all";
  const payment = paymentFilter?.value ?? "all";
  let firstVisible: GapRow | undefined;
  let count = 0;

  gapRows.forEach((row) => {
    const matchesQuery = !query || row.dataset.search.includes(query);
    const matchesSeverity = severity === "all" || row.dataset.severity === severity;
    const matchesBranch = branch === "all" || row.dataset.branch === branch;
    const matchesPayment = payment === "all" || row.dataset.payment === payment;
    const visible = matchesQuery && matchesSeverity && matchesBranch && matchesPayment;
    row.hidden = !visible;
    if (visible) {
      count += 1;
      if (!firstVisible) firstVisible = row;
    }
  });

  if (visibleCount) visibleCount.textContent = formatCount(count);
  if (firstVisible) selectGapRow(firstVisible);
}

gapRows.forEach((row) => {
  row.addEventListener("click", () => selectGapRow(row));
  row.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectGapRow(row);
    }
  });
});

searchInput?.addEventListener("input", applyGapFilters);
severityFilter?.addEventListener("change", applyGapFilters);
branchFilter?.addEventListener("change", applyGapFilters);
paymentFilter?.addEventListener("change", applyGapFilters);

applyGapFilters();
