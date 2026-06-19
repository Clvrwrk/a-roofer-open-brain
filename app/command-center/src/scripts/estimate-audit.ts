// Operations → Estimate Audit client renderer.
// Builds the PE Office → Job → Estimate → Line tree from the embedded payload
// and wires the human-in-the-loop editing: per-estimate margin % box, per-line
// qty adjust, one-off price entry, add/delete line — all recalculated locally.
// Nothing persists yet (write-back to Supabase is the follow-up); edits toast
// "recalculated locally — not saved".

interface Line { lineId: string; description: string; qty: number; uom: string; unitCost: number; lineCost: number; linePrice: number; categoryKey: string; }
interface Category { key: string; label: string; sortOrder: number; }
interface EstOption {
  estimateId: string; tier: string; tierLabel: string; customName: string | null;
  productCost: number; laborCost: number; feeCost: number; totalCost: number; totalPrice: number;
  marginPct: number; marginRevenue: number; selected: boolean; approved: boolean; status: string;
  lineCount: number; lines: Line[];
}
interface Job {
  runId: string; street: string; addressFull: string; office: string; jobType: string; insurance: boolean;
  status: string; prospecting: boolean; clientName: string; salesRep: string; managerName: string;
  managerEmail: string; branchName: string; branchCode: string; driveMinutes: number | null;
  negotiatedPricing: boolean; estimatedValue: number; estimatedMargin: number; estimateApproved: boolean;
  approvedBy: string; approvedAt: string; hasMeasurement: boolean; hasProposal: boolean;
  scenarioCount: number; selectedCount: number; estimates: EstOption[];
}
interface Office { office: string; jobCount: number; jobsProspecting: number; estimateYes: number; proposalYes: number; measurementYes: number; jobs: Job[]; }
interface Payload { status: string; offices: Office[]; categories: Category[]; }

const root = document.querySelector(".ea") as HTMLElement | null;
const dataEl = document.getElementById("ea-data");
const mount = document.getElementById("ea-offices");

if (root && dataEl && mount) {
  const data = JSON.parse(dataEl.textContent || "{}") as Payload;
  const catList: Category[] = (data.categories ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
  const catLabel = new Map(catList.map((c) => [c.key, c.label]));

  const money = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
  const money2 = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const yn = (b: boolean) => `<span class="pill ${b ? "pill-green" : "pill-grey"}">${b ? "Yes" : "No"}</span>`;
  const esc = (s: string) => String(s ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c] || c));
  const contact = (name: string, email: string) =>
    name ? (email ? `<a href="mailto:${esc(email)}">${esc(name)}</a>` : esc(name)) : '<span class="pill pill-grey">TBD</span>';

  /* ---- recalc: lines drive material cost; labor + fee stay fixed ---- */
  function recalc(est: EstOption) {
    const material = est.lines.reduce((s, l) => s + (l.lineCost = Math.round(l.qty * l.unitCost * 100) / 100), 0);
    est.productCost = Math.round(material * 100) / 100;
    est.totalCost = Math.round((est.productCost + est.laborCost + est.feeCost) * 100) / 100;
    const m = Math.min(Math.max(est.marginPct, 0), 99.9) / 100;
    est.totalPrice = Math.round((est.totalCost / (1 - m)) * 100) / 100;
    est.marginRevenue = Math.round((est.totalPrice - est.totalCost) * 100) / 100;
    est.lines.forEach((l) => (l.linePrice = Math.round((l.lineCost / (1 - m)) * 100) / 100));
  }

  /* ---- render: one editable line row (keeps its original est.lines index) ---- */
  const THEAD = '<thead><tr><th>Description</th><th class="num">Qty</th><th>UOM</th><th class="num">Unit Cost</th><th class="num">Line Cost</th><th class="num">Line Price</th><th></th></tr></thead>';
  function lineRow(l: Line, li: number, oi: number, ji: number, ei: number): string {
    return `
        <tr>
          <td>${esc(l.description) || "<em>New line</em>"}</td>
          <td class="num"><input class="ea-qty" type="number" step="any" value="${l.qty}" data-edit="qty" data-o="${oi}" data-j="${ji}" data-e="${ei}" data-l="${li}" /></td>
          <td>${esc(l.uom)}</td>
          <td class="num"><input class="ea-price" type="number" step="any" value="${l.unitCost}" data-edit="unit" data-o="${oi}" data-j="${ji}" data-e="${ei}" data-l="${li}" title="Unit cost — set a one-off here when no pricing exists" /></td>
          <td class="num" data-cell="linecost">${money2(l.lineCost)}</td>
          <td class="num" data-cell="lineprice">${money2(l.linePrice)}</td>
          <td><button class="ea-del" data-del data-o="${oi}" data-j="${ji}" data-e="${ei}" data-l="${li}" title="Delete line">×</button></td>
        </tr>`;
  }

  // Group lines into collapsible roof-system category sections (preserving each
  // line's original est.lines index so qty/price edits + delete still map back).
  // Ordered by category sort_order; default-collapsed.
  function lineSections(est: EstOption, oi: number, ji: number, ei: number): string {
    const groups = new Map<string, number[]>();
    est.lines.forEach((l, li) => {
      const k = l.categoryKey || "uncategorized";
      (groups.get(k) ?? (groups.set(k, []), groups.get(k)!)).push(li);
    });
    const orderedKeys = catList.map((c) => c.key).filter((k) => groups.has(k));
    for (const k of groups.keys()) if (!orderedKeys.includes(k)) orderedKeys.push(k);

    return orderedKeys.map((k) => {
      const idxs = groups.get(k)!;
      const lines = idxs.map((li) => est.lines[li]);
      const cost = lines.reduce((s, l) => s + (l.lineCost || 0), 0);
      const price = lines.reduce((s, l) => s + (l.linePrice || 0), 0);
      const tags = [
        `<span class="pill pill-grey">${lines.length} lines</span>`,
        `<span class="ea-cat-sub">Cost ${money(cost)} · Price ${money(price)}</span>`,
      ].join("");
      return `
        <details class="ea-cat" data-cat="${esc(k)}">
          <summary><span class="ea-chev" aria-hidden="true">›</span><b>${esc(catLabel.get(k) || k)}</b><span class="ea-cat-tags">${tags}</span></summary>
          <table class="ea-table">${THEAD}<tbody>${idxs.map((li) => lineRow(est.lines[li], li, oi, ji, ei)).join("")}</tbody></table>
        </details>`;
    }).join("");
  }

  function estBody(est: EstOption, oi: number, ji: number, ei: number): string {
    return `
      <div class="ea-marginbox">
        <label for="m-${oi}-${ji}-${ei}">Profit margin %</label>
        <input id="m-${oi}-${ji}-${ei}" type="number" step="0.5" value="${est.marginPct}" data-edit="margin" data-o="${oi}" data-j="${ji}" data-e="${ei}" />
        <span class="ea-recalc">Cost <b data-recalc="cost">${money(est.totalCost)}</b> · Price <b data-recalc="price">${money(est.totalPrice)}</b> · Margin $ <b data-recalc="rev">${money(est.marginRevenue)}</b></span>
      </div>
      <div class="ea-cats" data-lines="${oi}-${ji}-${ei}">${lineSections(est, oi, ji, ei) || '<p class="ea-job-sub">No lines.</p>'}</div>
      <div class="ea-addrow"><button class="ea-addbtn" data-add data-o="${oi}" data-j="${ji}" data-e="${ei}">+ Add line</button><button class="ea-savebtn" data-save data-o="${oi}" data-j="${ji}" data-e="${ei}">Save estimate</button></div>`;
  }

  function estimateNode(est: EstOption, oi: number, ji: number, ei: number): string {
    const tierCls = est.tierLabel === "Good" ? "pill-grey" : est.tierLabel === "Better" ? "pill-yellow" : est.tierLabel === "Best" ? "pill-green" : "pill-brand";
    return `
      <details class="ea-est">
        <summary>
          <span class="ea-chev" aria-hidden="true">›</span>
          <span class="ea-est-tier"><span class="pill ${tierCls}">${esc(est.tierLabel)}</span></span>
          <span class="ea-est-stats">
            <span>Product <b data-s="prod">${money(est.productCost)}</b></span>
            <span>Labor <b>${money(est.laborCost)}</b></span>
            <span>Fees <b>${money(est.feeCost)}</b></span>
            <span>Margin <b data-s="mpct">${est.marginPct.toFixed(1)}%</b></span>
            <span>Margin $ <b data-s="rev">${money(est.marginRevenue)}</b></span>
            <span>Price <b data-s="price">${money(est.totalPrice)}</b></span>
          </span>
          <span class="ea-est-tags">${est.selected ? '<span class="pill pill-brand">Selected</span>' : ""}${est.approved ? '<span class="pill pill-green">Approved</span>' : `<span class="pill pill-grey">${esc(est.status)}</span>`}</span>
        </summary>
        <div class="ea-est-body" id="est-${oi}-${ji}-${ei}">${estBody(est, oi, ji, ei)}</div>
      </details>`;
  }

  function jobNode(job: Job, oi: number, ji: number): string {
    const cls = (b: boolean) => (b ? "pill-green" : "pill-red");
    return `
      <details class="ea-job" data-search="${esc([job.street, job.branchName, job.clientName, job.office].join(" ").toLowerCase())}">
        <summary>
          <span class="ea-chev" aria-hidden="true">›</span>
          <span><span class="ea-job-addr">${esc(job.street)}</span><br><span class="ea-job-sub">${esc(job.branchName)} · ${job.scenarioCount} estimates</span></span>
          <span class="ea-job-tags">
            <span class="pill ${job.insurance ? "pill-yellow" : "pill-grey"}">${job.insurance ? "Insurance" : "Retail"}</span>
            <span class="pill ${job.prospecting ? "pill-brand" : "pill-green"}">${esc(job.status)}</span>
            <span class="pill ${cls(job.negotiatedPricing)}">${job.negotiatedPricing ? "Negotiated" : "No agreement"}</span>
            <span class="pill pill-grey">${money(job.estimatedValue)}</span>
            <span class="pill pill-grey">${job.estimatedMargin.toFixed(0)}% margin</span>
          </span>
        </summary>
        <div class="ea-job-body">
          <dl class="ea-detail-grid">
            <div><dt>Job ID</dt><dd>${esc(job.runId.slice(0, 8))}</dd></div>
            <div><dt>Job Number</dt><dd><span class="pill pill-grey">TBD</span></dd></div>
            <div><dt>Job Type</dt><dd><span class="pill pill-grey">C/R/I/S — TBD</span></dd></div>
            <div><dt>Sub-Type</dt><dd>${job.insurance ? "Insurance" : "Retail"}</dd></div>
            <div><dt>Address</dt><dd>${esc(job.addressFull || job.street)}</dd></div>
            <div><dt>Status</dt><dd>${esc(job.status)}</dd></div>
            <div><dt>PE Sales Rep</dt><dd>${contact(job.salesRep, "")}</dd></div>
            <div><dt>Client</dt><dd>${job.clientName ? esc(job.clientName) : '<span class="pill pill-grey">TBD</span>'}</dd></div>
            <div><dt>Estimated Job Value</dt><dd>${money(job.estimatedValue)}</dd></div>
            <div><dt>Insurance</dt><dd>${yn(job.insurance)}</dd></div>
            <div><dt>Closest Vendor Branch</dt><dd>${esc(job.branchName)}${job.driveMinutes != null ? ` · ${Math.round(job.driveMinutes)} min` : ""}</dd></div>
            <div><dt>Negotiated Pricing</dt><dd>${yn(job.negotiatedPricing)}</dd></div>
            <div><dt>Branch Manager</dt><dd>${contact(job.managerName, job.managerEmail)}</dd></div>
            <div><dt>Estimate Approved</dt><dd>${yn(job.estimateApproved)}</dd></div>
            <div><dt>Approved By</dt><dd>${job.approvedBy ? esc(job.approvedBy) : "—"}</dd></div>
            <div><dt>Approval Date</dt><dd>${job.approvedAt || "—"}</dd></div>
            <div><dt>Estimated Margin</dt><dd>${job.estimatedMargin.toFixed(1)}%</dd></div>
          </dl>
          ${job.estimates.map((e, ei) => estimateNode(e, oi, ji, ei)).join("")}
        </div>
      </details>`;
  }

  function officeNode(office: Office, oi: number): string {
    return `
      <details class="ea-office" data-office="${esc(office.office)}"${data.offices.length <= 2 ? " open" : ""}>
        <summary>
          <span class="ea-chev" aria-hidden="true">›</span>
          <span class="ea-office-name">${esc(office.office)}</span>
          <span class="ea-mini">
            <div><strong>${office.jobsProspecting}</strong><span>Jobs</span></div>
            <div><strong>${office.estimateYes}/${office.jobCount}</strong><span>Estimate</span></div>
            <div><strong>${office.proposalYes}/${office.jobCount}</strong><span>Proposal</span></div>
            <div><strong>${office.measurementYes}/${office.jobCount}</strong><span>Measured</span></div>
          </span>
        </summary>
        <div class="ea-office-body">${office.jobs.map((j, ji) => jobNode(j, oi, ji)).join("")}</div>
      </details>`;
  }

  function render() {
    mount.innerHTML = data.offices.map((o, oi) => officeNode(o, oi)).join("");
  }
  render();

  /* ---- editing (event delegation) ---- */
  const get = (el: HTMLElement) => {
    const o = +el.dataset.o!, j = +el.dataset.j!, e = +el.dataset.e!;
    return { o, j, e, est: data.offices[o].jobs[j].estimates[e] };
  };
  function rerenderEst(o: number, j: number, e: number) {
    const host = document.getElementById(`est-${o}-${j}-${e}`);
    if (host) host.innerHTML = estBody(data.offices[o].jobs[j].estimates[e], o, j, e);
    // refresh the summary stats too
    const det = host?.closest("details.ea-est");
    const est = data.offices[o].jobs[j].estimates[e];
    det?.querySelector('[data-s="prod"]')?.replaceChildren(money(est.productCost));
    det?.querySelector('[data-s="mpct"]')?.replaceChildren(est.marginPct.toFixed(1) + "%");
    det?.querySelector('[data-s="rev"]')?.replaceChildren(money(est.marginRevenue));
    det?.querySelector('[data-s="price"]')?.replaceChildren(money(est.totalPrice));
  }

  mount.addEventListener("input", (ev) => {
    const el = ev.target as HTMLElement;
    const edit = el.dataset?.edit;
    if (!edit) return;
    const { o, j, e, est } = get(el);
    const val = parseFloat((el as HTMLInputElement).value) || 0;
    if (edit === "margin") est.marginPct = val;
    else {
      const li = +el.dataset.l!;
      if (edit === "qty") est.lines[li].qty = val;
      if (edit === "unit") est.lines[li].unitCost = val;
    }
    recalc(est);
    rerenderEst(o, j, e);
    toast("Recalculated — click Save to persist");
  });

  async function saveEstimate(el: HTMLElement) {
    const { o, j, e, est } = get(el);
    const job = data.offices[o].jobs[j];
    const btn = el as HTMLButtonElement;
    btn.disabled = true; const orig = btn.textContent; btn.textContent = "Saving…";
    try {
      const res = await fetch("/api/operations/estimate-audit/save", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          estimateId: est.estimateId, runId: job.runId, marginPct: est.marginPct,
          lines: est.lines.map((l) => ({ lineId: l.lineId, description: l.description, qty: l.qty, uom: l.uom, unitCost: l.unitCost })),
        }),
      });
      const r = await res.json();
      toast(r.ok ? `Saved to Supabase — ${r.edits} edit${r.edits === 1 ? "" : "s"}` : "Save failed: " + (r.error_description || r.error || "error"));
    } catch { toast("Save failed — network error"); }
    btn.disabled = false; btn.textContent = orig || "Save estimate";
  }

  mount.addEventListener("click", (ev) => {
    const saveEl = (ev.target as HTMLElement).closest("[data-save]") as HTMLElement | null;
    if (saveEl) { ev.preventDefault(); void saveEstimate(saveEl); return; }
    const el = (ev.target as HTMLElement).closest("[data-del],[data-add]") as HTMLElement | null;
    if (!el) return;
    ev.preventDefault();
    const { o, j, e, est } = get(el);
    if (el.hasAttribute("data-del")) {
      est.lines.splice(+el.dataset.l!, 1);
      toast("Line deleted (local)");
    } else {
      est.lines.push({ lineId: "new-" + est.lines.length, description: "", qty: 1, uom: "EA", unitCost: 0, lineCost: 0, linePrice: 0, categoryKey: "uncategorized" });
      toast("Line added — set description, qty, and one-off price");
    }
    recalc(est);
    rerenderEst(o, j, e);
  });

  /* ---- filter ---- */
  const search = document.getElementById("ea-search") as HTMLInputElement;
  const officeSel = document.getElementById("ea-office") as HTMLSelectElement;
  function applyFilter() {
    const q = search.value.trim().toLowerCase();
    const off = officeSel.value;
    document.querySelectorAll<HTMLElement>(".ea-office").forEach((oEl) => {
      const officeMatch = !off || oEl.dataset.office === off;
      let anyJob = false;
      oEl.querySelectorAll<HTMLElement>(".ea-job").forEach((jEl) => {
        const ok = officeMatch && (!q || (jEl.dataset.search || "").includes(q));
        jEl.style.display = ok ? "" : "none";
        if (ok) anyJob = true;
      });
      oEl.style.display = officeMatch && anyJob ? "" : "none";
    });
  }
  [search, officeSel].forEach((el) => el.addEventListener("input", applyFilter));

  /* ---- theme toggle ---- */
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  function applyTheme(pref: string) {
    root!.dataset.theme = pref === "system" ? (mq.matches ? "dark" : "light") : pref;
    root!.dataset.pref = pref;
    root!.querySelectorAll<HTMLButtonElement>(".ea-theme button").forEach((b) => b.classList.toggle("is-active", b.dataset.setTheme === pref));
  }
  let pref = "system";
  try { pref = localStorage.getItem("eaTheme") || "system"; } catch {}
  applyTheme(pref);
  root.querySelectorAll<HTMLButtonElement>(".ea-theme button").forEach((b) =>
    b.addEventListener("click", () => { try { localStorage.setItem("eaTheme", b.dataset.setTheme!); } catch {} applyTheme(b.dataset.setTheme!); }),
  );
  mq.addEventListener("change", () => { if (root!.dataset.pref === "system") applyTheme("system"); });

  /* ---- toast ---- */
  let timer: number | undefined;
  const toastEl = document.getElementById("ea-toast")!;
  function toast(msg: string) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    window.clearTimeout(timer);
    timer = window.setTimeout(() => toastEl.classList.remove("show"), 2200);
  }
}
