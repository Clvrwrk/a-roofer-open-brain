// Invoice Audit — PE Office → Vendor/Branch → Invoice → Line drill-down.
// Lazy-renders invoice lines + disposition on expand. Reads ?office=/?branch=
// to land pre-filtered (scoped deep-link from the map popup / side card).

interface InvLine { lineId: string; itemNumber: string; itemDescription: string; qty: number; uom: string; unitPrice: number; extendedPrice: number; negotiatedPrice: number | null; variancePct: number | null; varianceExt: number | null; uomMismatch: boolean; negotiatedUom: string; categoryKey: string; audited: boolean; auditStatus: string; auditedBy: string; auditNote: string; auditSource: string; auditedAt: string; agreementId: number | null; agreementCurrent: boolean | null; agreementExpiry: string; }
interface Category { key: string; label: string; sortOrder: number; }
interface Invoice { invoiceNumber: string; invoiceDate: string; orderDate: string; totalAmount: number; isCreditMemo: boolean; salesType: string; po: string; branchCode: string; branchName: string; office: string; lineCount: number; noPriceLines: number; flaggedLines: number; atRisk: number; worstPct: number; auditedLines: number; pendingLines: number; paid: boolean; paidAt: string; hasPdf: boolean; jobNumber: string; clientName: string; jobCategory: string; lines: InvLine[]; }
interface Branch { branchCode: string; branchName: string; office: string; invoiceCount: number; creditMemos: number; atRisk: number; noPrice: number; flagged: number; pending: number; invoices: Invoice[]; }
interface Office { office: string; branchCount: number; invoiceCount: number; creditMemos: number; atRisk: number; noPrice: number; flagged: number; pending: number; branches: Branch[]; }
interface Action { id: string; group: string; label: string; hint: string; }

const root = document.querySelector(".iv") as HTMLElement | null;
const dataEl = document.getElementById("iv-data");
const mount = document.getElementById("iv-tree");

if (root && dataEl && mount) {
  const { offices, actions, categories } = JSON.parse(dataEl.textContent || "{}") as { offices: Office[]; actions: Action[]; categories: Category[] };
  const catList: Category[] = (categories ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
  const catLabel = new Map(catList.map((c) => [c.key, c.label]));

  const money = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
  const money2 = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pct = (n: number) => (n >= 0 ? "+" : "") + n.toFixed(1) + "%";
  const esc = (s: string) => String(s ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c] || c));
  const worstCls = (w: number) => (w > 6 ? "pill-red" : w > 3 ? "pill-orange" : w > 0.01 ? "pill-yellow" : "pill-green");
  const tolCls = (p: number | null) => { if (p == null) return "pill-grey"; const a = Math.abs(p); return a < 0.01 ? "pill-green" : a <= 3 ? "pill-yellow" : a <= 6 ? "pill-orange" : "pill-red"; };
  const tolLab = (p: number | null) => { if (p == null) return "No Price"; const a = Math.abs(p); return a < 0.01 ? "In Tolerance" : a <= 3 ? "Minor" : a <= 6 ? "Moderate" : "Major"; };

  /* ---- line + disposition (lazy) ---- */
  function auditCell(l: InvLine): string {
    if (l.audited) {
      const meta = [l.auditNote, l.agreementId ? `Agreement #${l.agreementId}${l.agreementCurrent === false ? " (expired " + l.agreementExpiry + ")" : ""}` : "", l.auditedAt].filter(Boolean).join(" · ");
      return `<span class="iv-audited" title="${esc(meta)}">✓ ${esc(l.auditedBy || "Passed")}</span>`;
    }
    return `<button class="iv-mark" data-mark data-line="LIDX">Mark passed</button>`;
  }
  const THEAD = '<thead><tr><th>Item</th><th>Description</th><th class="num">Qty</th><th>UOM</th><th class="num">Inv Price</th><th class="num">API Price</th><th>Negotiated</th><th class="num">Var %</th><th class="num">Var $</th><th>Tolerance</th><th>Audited</th></tr></thead>';
  function lineRow(l: InvLine, li: number): string {
    // UOM mismatch: the agreement is priced in a different unit than the invoice line,
    // so a variance would be meaningless — surface it for manual review instead (schema 120).
    const negCell = l.uomMismatch
      ? `<span class="pill pill-orange" title="Agreement priced per ${esc(l.negotiatedUom || "?")} but invoiced per ${esc(l.uom)} — review">UOM mismatch</span>`
      : (l.negotiatedPrice == null ? '<span class="pill pill-red">No Price</span>' : `${money2(l.negotiatedPrice)} <span class="pill pill-green">Negotiated</span>`);
    const tolCell = l.uomMismatch
      ? '<span class="pill pill-grey">Review (UOM)</span>'
      : `<span class="pill ${tolCls(l.variancePct)}">${tolLab(l.variancePct)}</span>`;
    return `
      <tr class="iv-ln${l.audited ? " is-audited" : ""}" data-line="${li}">
        <td class="iv-sku">${esc(l.itemNumber)}</td>
        <td>${esc(l.itemDescription)}</td>
        <td class="num">${l.qty}</td>
        <td>${esc(l.uom)}</td>
        <td class="num">${money2(l.unitPrice)}</td>
        <td class="num">${l.apiPrice == null ? "—" : money2(l.apiPrice)}</td>
        <td>${negCell}</td>
        <td class="num">${l.variancePct == null ? "—" : pct(l.variancePct)}</td>
        <td class="num">${l.varianceExt == null ? "—" : money2(l.varianceExt)}</td>
        <td>${tolCell}</td>
        <td class="iv-audit-cell">${auditCell(l).replace("LIDX", String(li))}</td>
      </tr>`;
  }
  // Group lines into collapsible roof-system category sections (preserving each line's
  // original index so disposition still maps to inv.lines[idx]). Default-collapsed.
  function invoiceBody(inv: Invoice): string {
    const groups = new Map<string, number[]>();
    inv.lines.forEach((l, li) => {
      const k = l.categoryKey || "uncategorized";
      (groups.get(k) ?? (groups.set(k, []), groups.get(k)!)).push(li);
    });
    const orderedKeys = catList.map((c) => c.key).filter((k) => groups.has(k));
    for (const k of groups.keys()) if (!orderedKeys.includes(k)) orderedKeys.push(k);

    const sections = orderedKeys.map((k) => {
      const idxs = groups.get(k)!;
      const lines = idxs.map((li) => inv.lines[li]);
      const subtotal = lines.reduce((s, l) => s + (l.extendedPrice || 0), 0);
      const atRisk = lines.reduce((s, l) => s + (!l.audited && (l.varianceExt || 0) > 0 ? l.varianceExt! : 0), 0);
      const pend = lines.filter((l) => !l.audited).length;
      const tags = [
        `<span class="pill pill-grey">${lines.length} lines</span>`,
        pend > 0 ? `<span class="pill pill-brand">${pend} to audit</span>` : '<span class="pill pill-green">✓</span>',
        `<span class="iv-cat-sub">${money(subtotal)}</span>`,
        atRisk > 0 ? `<span class="pill pill-red">${money(atRisk)} at risk</span>` : "",
      ].filter(Boolean).join("");
      return `
        <details class="iv-cat" data-cat="${esc(k)}" data-pend="${pend}">
          <summary><span class="iv-chev" aria-hidden="true">›</span><b>${esc(catLabel.get(k) || k)}</b><span class="iv-cat-tags">${tags}</span></summary>
          <table class="iv-table">${THEAD}<tbody>${idxs.map((li) => lineRow(inv.lines[li], li)).join("")}</tbody></table>
        </details>`;
    }).join("");

    return `
      <div class="iv-cats">${sections || '<p class="iv-disp-lead">No lines.</p>'}</div>
      <div class="iv-disp"><div class="iv-disp-lead">Select a line item above to disposition it, or use “Mark passed”.</div></div>`;
  }

  async function recordAudit(inv: Invoice, l: InvLine, body: { status?: string; decision?: string; note: string }) {
    try {
      const res = await fetch("/api/invoice-audit/mark", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ invoiceLineId: l.lineId, invoiceNumber: inv.invoiceNumber, itemNumber: l.itemNumber, status: body.status ?? "passed", decision: body.decision, note: body.note }) });
      const r = await res.json();
      if (!r.ok) { toast("Save failed: " + (r.error_description || r.error || "error")); return; }
      l.audited = (body.status ?? "passed") === "passed";
      l.auditStatus = body.status ?? "passed";
      l.auditedBy = r.record?.approved_by || "operator";
      l.auditNote = r.record?.approval_note || body.note;
      l.auditSource = "manual";
      l.auditedAt = (r.record?.decided_at || "").slice(0, 10);
      inv.auditedLines = inv.lines.filter((x) => x.audited).length;
      inv.pendingLines = inv.lines.length - inv.auditedLines;
      reRenderInvoice(inv);
      toast("Audit recorded: " + body.note);
    } catch (e) {
      toast("Save failed — network error");
    }
  }

  function reRenderInvoice(inv: Invoice) {
    const body = mount!.querySelector(`.iv-inv-body[data-inv="${CSS.escape(inv.invoiceNumber)}"]`) as HTMLElement | null;
    const det = body?.closest("details.iv-inv") as HTMLDetailsElement | null;
    if (!body || !det) return;
    body.innerHTML = invoiceBody(inv);
    bindInvoice(det, inv);
    refreshInvoiceTags(det, inv);
    applyFilter();
  }

  function refreshInvoiceTags(det: HTMLElement, inv: Invoice) {
    const tags = det.querySelector(".iv-inv-tags");
    if (tags) tags.innerHTML = invoiceTags(inv);
    det.dataset.pending = String(inv.pendingLines);
  }

  function bindInvoice(det: HTMLDetailsElement, inv: Invoice) {
    const disp = det.querySelector(".iv-disp") as HTMLElement;
    det.querySelectorAll<HTMLButtonElement>("[data-mark]").forEach((b) =>
      b.addEventListener("click", (ev) => { ev.stopPropagation(); recordAudit(inv, inv.lines[+b.dataset.line!], { status: "passed", note: "Manually passed" }); }));
    const dispReset = '<div class="iv-disp-lead">Select a line item above to disposition it, or use “Mark passed”.</div>';
    det.querySelectorAll<HTMLElement>(".iv-ln").forEach((row) =>
      row.addEventListener("click", () => {
        // Click an already-active line to deselect + collapse the disposition
        // panel (keeps long invoices from running off-screen).
        const wasSel = row.classList.contains("sel");
        det.querySelectorAll(".iv-ln").forEach((r) => r.classList.remove("sel"));
        if (wasSel) { disp.innerHTML = dispReset; return; }
        row.classList.add("sel");
        const l = inv.lines[+row.dataset.line!];
        const accepts = actions.filter((a) => a.group === "accept");
        const credits = actions.filter((a) => a.group === "credit");
        const btn = (a: Action) => `<button class="iv-act ${a.group}" data-action="${a.id}" data-group="${a.group}" data-label="${esc(a.label)}"><span class="t">${esc(a.label)}</span><span class="h">${esc(a.hint)}</span></button>`;
        disp.innerHTML = `
          <div class="iv-disp-lead">Disposition <b>${esc(l.itemNumber)}</b> — ${esc(l.itemDescription)} · Inv ${money2(l.unitPrice)} vs ${l.negotiatedPrice == null ? "No Price" : money2(l.negotiatedPrice)}${l.variancePct != null ? ` · <span class="pill ${tolCls(l.variancePct)}">${pct(l.variancePct)} ${tolLab(l.variancePct)}</span>` : ""}${l.audited ? ` · <span class="pill pill-green">Audited · ${esc(l.auditedBy)}</span>` : ""}</div>
          <div class="iv-grid2"><div class="iv-grp">Accept pricing</div>${accepts.map(btn).join("")}<div class="iv-grp">Dispute — generate credit memo</div>${credits.map(btn).join("")}</div>`;
        disp.querySelectorAll<HTMLButtonElement>(".iv-act").forEach((b) =>
          b.addEventListener("click", () => {
            disp.querySelectorAll(".iv-act").forEach((x) => x.classList.remove("chosen"));
            b.classList.add("chosen");
            const status = b.dataset.group === "credit" ? "disputed" : "passed";
            recordAudit(inv, l, { status, decision: b.dataset.action, note: b.dataset.label! });
          }));
      }));
  }

  /* ---- tree render ---- */
  function invoiceTags(inv: Invoice): string {
    return [
      inv.pendingLines > 0 ? `<span class="pill pill-brand">${inv.pendingLines}/${inv.lineCount} to audit</span>` : '<span class="pill pill-green">✓ Audited</span>',
      inv.isCreditMemo ? '<span class="pill pill-grey">Credit Memo</span>' : "",
      inv.paid ? `<span class="pill pill-green" title="Paid ${esc(inv.paidAt)}">Paid</span>` : '<span class="pill pill-yellow">Open</span>',
      inv.worstPct > 0.01 ? `<span class="pill ${worstCls(inv.worstPct)}">${inv.worstPct.toFixed(1)}% worst</span>` : "",
      inv.atRisk > 0 ? `<span class="pill pill-red">${money(inv.atRisk)} at risk</span>` : "",
    ].filter(Boolean).join("");
  }
  function invoiceNode(inv: Invoice, hasPriceList: boolean): string {
    // Purple callout: PO is shown for every invoice that has one (169/172); client name + job
    // type are appended when the PO matches an AccuLynx job (v_invoice_acculynx_match).
    // The job number usually equals the PO (that's how they matched), so show it only when it differs.
    const norm = (s: string) => s.replace(/[^a-z0-9]/gi, "").toLowerCase();
    const calloutBits = [
      inv.po ? "PO " + esc(inv.po) : (inv.jobNumber ? esc(inv.jobNumber) : ""),
      inv.jobNumber && norm(inv.jobNumber) !== norm(inv.po) ? esc(inv.jobNumber) : "",
      inv.clientName ? esc(inv.clientName) : "",
      inv.jobCategory ? esc(inv.jobCategory) : "",
    ].filter(Boolean);
    const job = calloutBits.length ? ` · <span class="iv-job">${calloutBits.join(" · ")}</span>` : "";
    // Invoice PDF: always an active link — the endpoint fetches it on demand from ABC
    // and stores it if no PDF is on file yet (so every invoice resolves to a document).
    const invoiceBtn = `<a class="iv-rowbtn" href="/api/invoice-audit/pdf/${encodeURIComponent(inv.invoiceNumber)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">📄 Invoice</a>`;
    // Price List: greyed + non-navigating when this branch has no negotiated price list
    // (otherwise the link lands on a blank price-list screen).
    const priceListBtn = hasPriceList
      ? `<a class="iv-rowbtn" href="/accounting/price-list/branch?branch=${encodeURIComponent(inv.branchCode)}&invoice=${encodeURIComponent(inv.invoiceNumber)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">📋 Price List</a>`
      : `<span class="iv-rowbtn is-disabled" aria-disabled="true" title="No price list on file for this branch" onclick="event.stopPropagation()">📋 Price List</span>`;
    return `
      <details class="iv-inv" data-search="${esc((inv.invoiceNumber + " " + inv.po + " " + inv.lines.map((l) => l.itemNumber + " " + l.itemDescription).join(" ")).toLowerCase())}" data-worst="${inv.worstPct}" data-noprice="${inv.noPriceLines}" data-pending="${inv.pendingLines}" data-atrisk="${inv.atRisk}" data-paid="${inv.paid ? "1" : "0"}">
        <summary>
          <span class="iv-chev" aria-hidden="true">›</span>
          <span class="iv-inv-id"><span class="iv-inv-no">${esc(inv.invoiceNumber)}</span> <span class="iv-inv-sub">${inv.invoiceDate}${job}</span></span>
          <span class="iv-rowbtns">${priceListBtn}${invoiceBtn}</span>
          <span class="iv-inv-tags">${invoiceTags(inv)}</span>
        </summary>
        <div class="iv-inv-body" data-inv="${esc(inv.invoiceNumber)}"></div>
      </details>`;
  }

  // Rollup pills/stats are rebuilt from the *visible* invoices on every filter change
  // (applyFilter), so the office/branch bars always match the active scope — open-only
  // by default, since that is this dashboard's sole task. Shared builders keep the
  // render-time and recompute-time markup identical.
  interface Roll { invoiceCount: number; pending: number; atRisk: number; noPrice: number; }
  function branchTags(r: Roll): string {
    return [
      `<span class="pill pill-grey">${r.invoiceCount} invoices</span>`,
      r.pending ? `<span class="pill pill-brand">${r.pending} to audit</span>` : '<span class="pill pill-green">✓ Audited</span>',
      r.atRisk > 0 ? `<span class="pill pill-red">${money(r.atRisk)} at risk</span>` : "",
      r.noPrice ? `<span class="pill pill-yellow">${r.noPrice} no-price</span>` : "",
    ].filter(Boolean).join("");
  }
  function officeMini(r: Roll): string {
    return [
      `<div><strong>${r.pending}</strong><span>To Audit</span></div>`,
      `<div><strong>${r.invoiceCount}</strong><span>Invoices</span></div>`,
      `<div><strong>${money(r.atRisk)}</strong><span>At Risk</span></div>`,
      `<div><strong>${r.noPrice}</strong><span>No-Price</span></div>`,
    ].join("");
  }

  function branchNode(br: Branch): string {
    // A branch has a price list iff at least one of its lines resolved a negotiated price.
    const branchHasPriceList = br.invoices.some((i) => i.lines.some((l) => l.negotiatedPrice != null));
    return `
      <details class="iv-branch" data-branch="${esc(br.branchCode)}" data-search="${esc((br.branchName + " " + br.branchCode).toLowerCase())}">
        <summary>
          <span class="iv-chev" aria-hidden="true">›</span>
          <span><span class="iv-branch-name">${esc(br.branchName)}</span> <span class="iv-inv-sub">#${esc(br.branchCode)}</span></span>
          <span class="iv-branch-tags">${branchTags(br)}</span>
        </summary>
        <div class="iv-branch-body">${br.invoices.map((inv) => invoiceNode(inv, branchHasPriceList)).join("")}</div>
      </details>`;
  }

  function officeNode(off: Office): string {
    return `
      <details class="iv-office" data-office="${esc(off.office)}">
        <summary>
          <span class="iv-chev" aria-hidden="true">›</span>
          <span class="iv-office-name">${esc(off.office)}</span>
          <span class="iv-mini">${officeMini({ invoiceCount: off.invoiceCount, pending: off.pending, atRisk: off.atRisk, noPrice: off.noPrice })}</span>
        </summary>
        <div class="iv-office-body">${off.branches.map(branchNode).join("")}</div>
      </details>`;
  }

  mount.innerHTML = offices.map(officeNode).join("");

  // Lazy-render invoice bodies on first expand.
  const invByNumber = new Map<string, Invoice>();
  offices.forEach((o) => o.branches.forEach((b) => b.invoices.forEach((i) => invByNumber.set(i.invoiceNumber, i))));
  mount.querySelectorAll<HTMLDetailsElement>(".iv-inv").forEach((det) => {
    det.addEventListener("toggle", () => {
      if (!det.open) return;
      const body = det.querySelector(".iv-inv-body") as HTMLElement;
      if (body.dataset.rendered) return;
      const inv = invByNumber.get(body.dataset.inv!);
      if (!inv) return;
      body.innerHTML = invoiceBody(inv);
      body.dataset.rendered = "1";
      bindInvoice(det, inv);
    });
  });

  /* ---- filters ---- */
  const search = document.getElementById("iv-search") as HTMLInputElement;
  const officeSel = document.getElementById("iv-office") as HTMLSelectElement;
  const tolSel = document.getElementById("iv-tol") as HTMLSelectElement;
  const statusSel = document.getElementById("iv-status") as HTMLSelectElement;
  const pendingBox = document.getElementById("iv-pending") as HTMLInputElement;
  function applyFilter() {
    const q = search.value.trim().toLowerCase();
    const off = officeSel.value;
    const tol = tolSel.value;
    const status = statusSel?.value ?? "";
    const pendingOnly = pendingBox?.checked;
    root!.classList.toggle("iv-pending-only", !!pendingOnly); // CSS hides audited line rows
    mount.querySelectorAll<HTMLElement>(".iv-office").forEach((oEl) => {
      const officeOk = !off || oEl.dataset.office === off;
      let officeHas = false;
      const offRoll: Roll = { invoiceCount: 0, pending: 0, atRisk: 0, noPrice: 0 };
      oEl.querySelectorAll<HTMLElement>(".iv-branch").forEach((bEl) => {
        let branchHas = false;
        const brRoll: Roll = { invoiceCount: 0, pending: 0, atRisk: 0, noPrice: 0 };
        bEl.querySelectorAll<HTMLElement>(".iv-inv").forEach((iEl) => {
          const worst = parseFloat(iEl.dataset.worst || "0");
          const noprice = parseInt(iEl.dataset.noprice || "0", 10);
          const pending = parseInt(iEl.dataset.pending || "0", 10);
          const atrisk = parseFloat(iEl.dataset.atrisk || "0");
          const paid = iEl.dataset.paid === "1";
          const tolOk = !tol ? true : tol === "noprice" ? noprice > 0 : worst >= parseFloat(tol);
          const statusOk = status === "open" ? !paid : status === "paid" ? paid : true;
          const pendOk = !pendingOnly || pending > 0;
          const qOk = !q || (iEl.dataset.search || "").includes(q) || (bEl.dataset.search || "").includes(q);
          const ok = officeOk && tolOk && statusOk && pendOk && qOk;
          iEl.style.display = ok ? "" : "none";
          if (ok) branchHas = true;
          // Bars track the STATUS scope (open by default — the dashboard's sole task), not the
          // tol/to-audit/search drill filters. So the office "Invoices" headcount sums to the
          // open KPI (172), while "To Audit" stays the work remaining within that scope.
          if (statusOk && officeOk) {
            brRoll.invoiceCount++; brRoll.pending += pending; brRoll.atRisk += atrisk; brRoll.noPrice += noprice;
          }
        });
        bEl.style.display = branchHas ? "" : "none";
        const brTags = bEl.querySelector<HTMLElement>(".iv-branch-tags");
        if (brTags) brTags.innerHTML = branchTags({ ...brRoll, atRisk: Math.round(brRoll.atRisk) });
        if (branchHas) {
          officeHas = true;
          offRoll.invoiceCount += brRoll.invoiceCount; offRoll.pending += brRoll.pending;
          offRoll.atRisk += brRoll.atRisk; offRoll.noPrice += brRoll.noPrice;
        }
      });
      oEl.style.display = officeHas ? "" : "none";
      const mini = oEl.querySelector<HTMLElement>(".iv-mini");
      if (mini) mini.innerHTML = officeMini({ ...offRoll, atRisk: Math.round(offRoll.atRisk) });
    });
  }
  [search, officeSel, tolSel, statusSel, pendingBox].forEach((el) => el?.addEventListener("input", applyFilter));
  applyFilter();

  /* ---- scoped deep-link: ?office= / ?branch= ---- */
  const params = new URLSearchParams(window.location.search);
  const wantOffice = params.get("office");
  const wantBranch = params.get("branch");
  if (wantOffice || wantBranch) {
    let target: HTMLElement | null = null;
    mount.querySelectorAll<HTMLDetailsElement>(".iv-office").forEach((oEl) => {
      const oName = (oEl.dataset.office || "").toLowerCase();
      const officeHit = wantOffice && oName.includes(decodeURIComponent(wantOffice).toLowerCase());
      if (officeHit) { oEl.open = true; if (!target) target = oEl; officeSel.value = oEl.dataset.office!; }
      oEl.querySelectorAll<HTMLDetailsElement>(".iv-branch").forEach((bEl) => {
        if (wantBranch && bEl.dataset.branch === decodeURIComponent(wantBranch)) {
          oEl.open = true; bEl.open = true; target = bEl;
        }
      });
    });
    if (officeSel.value) applyFilter();
    if (target) (target as HTMLElement).scrollIntoView({ behavior: "smooth", block: "center" });
  }

  /* ---- theme toggle ---- */
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  function applyTheme(pref: string) {
    root!.dataset.theme = pref === "system" ? (mq.matches ? "dark" : "light") : pref;
    root!.dataset.pref = pref;
    root!.querySelectorAll<HTMLButtonElement>(".iv-theme button").forEach((b) => b.classList.toggle("is-active", b.dataset.setTheme === pref));
  }
  let pref = "system";
  try { pref = localStorage.getItem("ivTheme") || "system"; } catch {}
  applyTheme(pref);
  root.querySelectorAll<HTMLButtonElement>(".iv-theme button").forEach((b) =>
    b.addEventListener("click", () => { try { localStorage.setItem("ivTheme", b.dataset.setTheme!); } catch {} applyTheme(b.dataset.setTheme!); }));
  mq.addEventListener("change", () => { if (root!.dataset.pref === "system") applyTheme("system"); });

  /* ---- toast ---- */
  let timer: number | undefined;
  const toastEl = document.getElementById("iv-toast")!;
  function toast(msg: string) { toastEl.textContent = msg; toastEl.classList.add("show"); window.clearTimeout(timer); timer = window.setTimeout(() => toastEl.classList.remove("show"), 2200); }
}
