// Invoice Audit — PE Office → Vendor/Branch → Invoice → Line drill-down.
// Lazy-renders invoice lines + disposition on expand. Reads ?office=/?branch=
// to land pre-filtered (scoped deep-link from the map popup / side card).

interface InvLine { lineId: string; itemNumber: string; itemDescription: string; qty: number; uom: string; unitPrice: number; extendedPrice: number; negotiatedPrice: number | null; variancePct: number | null; varianceExt: number | null; audited: boolean; auditStatus: string; auditedBy: string; auditNote: string; auditSource: string; auditedAt: string; agreementId: number | null; agreementCurrent: boolean | null; agreementExpiry: string; }
interface Invoice { invoiceNumber: string; invoiceDate: string; orderDate: string; totalAmount: number; isCreditMemo: boolean; salesType: string; po: string; branchCode: string; branchName: string; office: string; lineCount: number; noPriceLines: number; flaggedLines: number; atRisk: number; worstPct: number; auditedLines: number; pendingLines: number; paid: boolean; paidAt: string; hasPdf: boolean; lines: InvLine[]; }
interface Branch { branchCode: string; branchName: string; office: string; invoiceCount: number; creditMemos: number; atRisk: number; noPrice: number; flagged: number; pending: number; invoices: Invoice[]; }
interface Office { office: string; branchCount: number; invoiceCount: number; creditMemos: number; atRisk: number; noPrice: number; flagged: number; pending: number; branches: Branch[]; }
interface Action { id: string; group: string; label: string; hint: string; }

const root = document.querySelector(".iv") as HTMLElement | null;
const dataEl = document.getElementById("iv-data");
const mount = document.getElementById("iv-tree");

if (root && dataEl && mount) {
  const { offices, actions } = JSON.parse(dataEl.textContent || "{}") as { offices: Office[]; actions: Action[] };

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
  function invoiceBody(inv: Invoice): string {
    const rows = inv.lines.map((l, li) => `
      <tr class="iv-ln${l.audited ? " is-audited" : ""}" data-line="${li}">
        <td class="iv-sku">${esc(l.itemNumber)}</td>
        <td>${esc(l.itemDescription)}</td>
        <td class="num">${l.qty}</td>
        <td>${esc(l.uom)}</td>
        <td class="num">${money2(l.unitPrice)}</td>
        <td>${l.negotiatedPrice == null ? '<span class="pill pill-red">No Price</span>' : `${money2(l.negotiatedPrice)} <span class="pill pill-green">Negotiated</span>`}</td>
        <td class="num">${l.variancePct == null ? "—" : pct(l.variancePct)}</td>
        <td class="num">${l.varianceExt == null ? "—" : money2(l.varianceExt)}</td>
        <td><span class="pill ${tolCls(l.variancePct)}">${tolLab(l.variancePct)}</span></td>
        <td class="iv-audit-cell">${auditCell(l).replace("LIDX", String(li))}</td>
      </tr>`).join("");
    return `
      <table class="iv-table">
        <thead><tr><th>Item</th><th>Description</th><th class="num">Qty</th><th>UOM</th><th class="num">Inv Price</th><th>Negotiated</th><th class="num">Var %</th><th class="num">Var $</th><th>Tolerance</th><th>Audited</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="10">No lines.</td></tr>'}</tbody>
      </table>
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
  function invoiceNode(inv: Invoice): string {
    const linesLabel = inv.pendingLines > 0 ? `${inv.pendingLines} of ${inv.lineCount} lines to audit` : `${inv.lineCount} lines · all audited`;
    const pdf = inv.hasPdf ? ` · <a class="iv-pdf" href="/api/invoice-audit/pdf/${encodeURIComponent(inv.invoiceNumber)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">📄 PDF</a>` : "";
    return `
      <details class="iv-inv" data-search="${esc((inv.invoiceNumber + " " + inv.po + " " + inv.lines.map((l) => l.itemNumber + " " + l.itemDescription).join(" ")).toLowerCase())}" data-worst="${inv.worstPct}" data-noprice="${inv.noPriceLines}" data-pending="${inv.pendingLines}" data-paid="${inv.paid ? "1" : "0"}">
        <summary>
          <span class="iv-chev" aria-hidden="true">›</span>
          <span><span class="iv-inv-no">${esc(inv.invoiceNumber)}</span> <span class="iv-inv-sub">${inv.invoiceDate}${inv.po ? " · PO " + esc(inv.po) : ""}${pdf}</span></span>
          <a class="iv-pricelist" href="/accounting/price-list/branch?branch=${encodeURIComponent(inv.branchCode)}&invoice=${encodeURIComponent(inv.invoiceNumber)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">📋 Price List</a>
          <span class="iv-inv-tags">${invoiceTags(inv)}</span>
        </summary>
        <div class="iv-inv-body" data-inv="${esc(inv.invoiceNumber)}"></div>
      </details>`;
  }

  function branchNode(br: Branch): string {
    return `
      <details class="iv-branch" data-branch="${esc(br.branchCode)}" data-search="${esc((br.branchName + " " + br.branchCode).toLowerCase())}">
        <summary>
          <span class="iv-chev" aria-hidden="true">›</span>
          <span><span class="iv-branch-name">${esc(br.branchName)}</span> <span class="iv-inv-sub">#${esc(br.branchCode)}</span></span>
          <span class="iv-branch-tags">
            <span class="pill pill-grey">${br.invoiceCount} invoices</span>
            ${br.pending ? `<span class="pill pill-brand">${br.pending} to audit</span>` : '<span class="pill pill-green">✓ Audited</span>'}
            ${br.atRisk > 0 ? `<span class="pill pill-red">${money(br.atRisk)} at risk</span>` : ""}
            ${br.noPrice ? `<span class="pill pill-yellow">${br.noPrice} no-price</span>` : ""}
          </span>
        </summary>
        <div class="iv-branch-body">${br.invoices.map(invoiceNode).join("")}</div>
      </details>`;
  }

  function officeNode(off: Office): string {
    return `
      <details class="iv-office" data-office="${esc(off.office)}">
        <summary>
          <span class="iv-chev" aria-hidden="true">›</span>
          <span class="iv-office-name">${esc(off.office)}</span>
          <span class="iv-mini">
            <div><strong>${off.pending}</strong><span>To Audit</span></div>
            <div><strong>${off.invoiceCount}</strong><span>Invoices</span></div>
            <div><strong>${money(off.atRisk)}</strong><span>At Risk</span></div>
            <div><strong>${off.noPrice}</strong><span>No-Price</span></div>
          </span>
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
      oEl.querySelectorAll<HTMLElement>(".iv-branch").forEach((bEl) => {
        let branchHas = false;
        bEl.querySelectorAll<HTMLElement>(".iv-inv").forEach((iEl) => {
          const worst = parseFloat(iEl.dataset.worst || "0");
          const noprice = parseInt(iEl.dataset.noprice || "0", 10);
          const pending = parseInt(iEl.dataset.pending || "0", 10);
          const paid = iEl.dataset.paid === "1";
          const tolOk = !tol ? true : tol === "noprice" ? noprice > 0 : worst >= parseFloat(tol);
          const statusOk = status === "open" ? !paid : status === "paid" ? paid : true;
          const pendOk = !pendingOnly || pending > 0;
          const qOk = !q || (iEl.dataset.search || "").includes(q) || (bEl.dataset.search || "").includes(q);
          const ok = officeOk && tolOk && statusOk && pendOk && qOk;
          iEl.style.display = ok ? "" : "none";
          if (ok) branchHas = true;
        });
        bEl.style.display = branchHas ? "" : "none";
        if (branchHas) officeHas = true;
      });
      oEl.style.display = officeHas ? "" : "none";
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
