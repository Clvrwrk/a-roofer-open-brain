// Order Audit — PE Office → Vendor/Branch → Order → Line drill-down.
// Variance audit on priced ABC order lines (order unit price vs negotiated),
// catching pricing issues before invoicing. Read-only; lazy-renders lines on
// expand. Defaults to ACTIVE orders (archived = invoiced or >60d). Reads
// ?office=/?branch= to land pre-filtered.

interface OrdLine { lineId: string; lineKey: string; itemNumber: string; itemDescription: string; qty: number; uom: string; unitPrice: number; extendedPrice: number; apiPrice: number | null; apiUom: string; negotiatedPrice: number | null; variancePct: number | null; varianceExt: number | null; covered: boolean; uomMismatch: boolean; negotiatedUom: string; categoryKey: string; }
interface Category { key: string; label: string; sortOrder: number; }
interface Order { orderNumber: string; po: string; orderedOn: string; deliveryRequestedFor: string; orderStatus: string; orderType: string; orderTotal: number; lineTotal: number; disposition: "active" | "archived"; archiveReason: string; branchCode: string; branchName: string; office: string; lineCount: number; coveredLines: number; uncoveredLines: number; flaggedLines: number; atRisk: number; worstPct: number; matched: boolean; jobNumber: string; clientName: string; jobCategory: string; lines: OrdLine[]; }
interface Branch { branchCode: string; branchName: string; office: string; orderCount: number; activeCount: number; matched: number; orderTotal: number; atRisk: number; flaggedLines: number; uncoveredLines: number; orders: Order[]; }
interface Office { office: string; branchCount: number; orderCount: number; activeCount: number; matched: number; orderTotal: number; atRisk: number; flaggedLines: number; uncoveredLines: number; branches: Branch[]; }

const root = document.querySelector(".iv") as HTMLElement | null;
const dataEl = document.getElementById("iv-data");
const mount = document.getElementById("iv-tree");

if (root && dataEl && mount) {
  const { offices, categories } = JSON.parse(dataEl.textContent || "{}") as { offices: Office[]; categories: Category[] };
  const catList: Category[] = (categories ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
  const catLabel = new Map(catList.map((c) => [c.key, c.label]));

  const money = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
  const money2 = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pct = (n: number) => (n >= 0 ? "+" : "") + n.toFixed(1) + "%";
  const esc = (s: string) => String(s ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c] || c));
  const worstCls = (w: number) => (w > 6 ? "pill-red" : w > 3 ? "pill-orange" : w > 0.01 ? "pill-yellow" : "pill-green");
  const tolCls = (p: number | null) => { if (p == null) return "pill-grey"; const a = Math.abs(p); return a < 0.01 ? "pill-green" : a <= 3 ? "pill-yellow" : a <= 6 ? "pill-orange" : "pill-red"; };
  const tolLab = (p: number | null) => { if (p == null) return "No agreement"; const a = Math.abs(p); return a < 0.01 ? "In Tolerance" : a <= 3 ? "Minor" : a <= 6 ? "Moderate" : "Major"; };
  const statusPill = (s: string) => {
    const l = s.toLowerCase();
    if (l === "canceled" || l === "cancelled") return "pill-grey";
    if (l === "invoiced") return "pill-brand";
    if (l.includes("requested") || l === "in progress" || l === "processed" || l === "partial") return "pill-yellow";
    return "pill-green";
  };

  /* ---- line table (lazy) ---- */
  const THEAD = '<thead><tr><th>Item</th><th>Description</th><th class="num">Qty</th><th>UOM</th><th class="num">Order Price</th><th class="num">API Price</th><th>Negotiated</th><th class="num">Var %</th><th class="num">Var $</th><th>Tolerance</th></tr></thead>';
  function lineRow(l: OrdLine): string {
    // UOM mismatch (schema 121): agreement priced in a different unit than the order line,
    // so the variance is not computed — flag for manual review.
    const negCell = l.uomMismatch
      ? `<span class="pill pill-orange" title="Agreement priced per ${esc(l.negotiatedUom || "?")} but ordered per ${esc(l.uom)} — review">UOM mismatch</span>`
      : (l.negotiatedPrice == null ? '<span class="pill pill-grey">No agreement</span>' : `${money2(l.negotiatedPrice)} <span class="pill pill-green">Negotiated</span>`);
    const tolCell = l.uomMismatch
      ? '<span class="pill pill-grey">Review (UOM)</span>'
      : `<span class="pill ${tolCls(l.variancePct)}">${tolLab(l.variancePct)}</span>`;
    return `
      <tr class="iv-ln${l.covered ? " is-covered" : ""}">
        <td class="iv-sku">${esc(l.itemNumber)}</td>
        <td>${esc(l.itemDescription) || '<span class="iv-inv-sub">—</span>'}</td>
        <td class="num">${l.qty}</td>
        <td>${esc(l.uom)}</td>
        <td class="num">${money2(l.unitPrice)} <span class="iv-uom-sfx">/${esc(l.uom)}</span></td>
        <td class="num">${l.apiPrice == null ? '<span class="iv-uom-sfx">—</span>' : money2(l.apiPrice) + ` <span class="iv-uom-sfx">/${esc(l.apiUom || l.uom)}</span>`}</td>
        <td>${negCell}</td>
        <td class="num">${l.variancePct == null ? "—" : pct(l.variancePct)}</td>
        <td class="num">${l.varianceExt == null ? "—" : money2(l.varianceExt)}</td>
        <td>${tolCell}</td>
      </tr>`;
  }
  // Group lines into collapsible roof-system category sections (default-collapsed),
  // ordered by category sort_order. Mirrors invoiceBody() on the Invoice Audit screen.
  function orderBody(ord: Order): string {
    if (ord.lines.length === 0) return '<p class="iv-disp-lead">No lines.</p>';
    const groups = new Map<string, OrdLine[]>();
    ord.lines.forEach((l) => {
      const k = l.categoryKey || "uncategorized";
      (groups.get(k) ?? (groups.set(k, []), groups.get(k)!)).push(l);
    });
    const orderedKeys = catList.map((c) => c.key).filter((k) => groups.has(k));
    for (const k of groups.keys()) if (!orderedKeys.includes(k)) orderedKeys.push(k);

    const sections = orderedKeys.map((k) => {
      const lines = groups.get(k)!;
      const subtotal = lines.reduce((s, l) => s + (l.extendedPrice || 0), 0);
      const atRisk = lines.reduce((s, l) => s + ((l.varianceExt || 0) > 0 ? l.varianceExt! : 0), 0);
      const flagged = lines.filter((l) => l.variancePct != null && Math.abs(l.variancePct) >= 0.01).length;
      const tags = [
        `<span class="pill pill-grey">${lines.length} lines</span>`,
        flagged > 0 ? `<span class="pill pill-brand">${flagged} flagged</span>` : '<span class="pill pill-green">✓</span>',
        `<span class="iv-cat-sub">${money(subtotal)}</span>`,
        atRisk > 0 ? `<span class="pill pill-red">${money(atRisk)} at risk</span>` : "",
      ].filter(Boolean).join("");
      return `
        <details class="iv-cat" data-cat="${esc(k)}">
          <summary><span class="iv-chev" aria-hidden="true">›</span><b>${esc(catLabel.get(k) || k)}</b><span class="iv-cat-tags">${tags}</span></summary>
          <table class="iv-table">${THEAD}<tbody>${lines.map(lineRow).join("")}</tbody></table>
        </details>`;
    }).join("");

    return `<div class="iv-cats">${sections}</div>`;
  }

  /* ---- tree render ---- */
  function orderTags(ord: Order): string {
    return [
      ord.orderStatus ? `<span class="pill ${statusPill(ord.orderStatus)}">${esc(ord.orderStatus)}</span>` : "",
      ord.disposition === "archived" ? `<span class="pill pill-grey" title="Archived by system: ${esc(ord.archiveReason)}">Archived</span>` : '<span class="pill pill-green">Active</span>',
      ord.matched ? '<span class="pill pill-brand">✓ Job matched</span>' : '<span class="pill pill-yellow">No PE job</span>',
      ord.worstPct > 0.01 ? `<span class="pill ${worstCls(ord.worstPct)}">${ord.worstPct.toFixed(1)}% worst</span>` : "",
      ord.atRisk > 0 ? `<span class="pill pill-red">${money(ord.atRisk)} at risk</span>` : "",
    ].filter(Boolean).join("");
  }
  function orderNode(ord: Order): string {
    const job = ord.matched ? ` · <span class="iv-job">${esc(ord.jobNumber)}${ord.clientName ? " · " + esc(ord.clientName) : ""}${ord.jobCategory ? " · " + esc(ord.jobCategory) : ""}</span>` : "";
    const dates = [ord.orderedOn, ord.deliveryRequestedFor ? "→ " + ord.deliveryRequestedFor : ""].filter(Boolean).join(" ");
    const search = (ord.orderNumber + " " + ord.po + " " + ord.jobNumber + " " + ord.clientName).toLowerCase();
    return `
      <details class="iv-inv" data-search="${esc(search)}" data-matched="${ord.matched ? "1" : "0"}" data-disp="${ord.disposition}" data-worst="${ord.worstPct}" data-noprice="${ord.uncoveredLines}">
        <summary>
          <span class="iv-chev" aria-hidden="true">›</span>
          <span><span class="iv-inv-no">${esc(ord.orderNumber)}</span> <span class="iv-inv-sub">${dates}${ord.po ? " · PO " + esc(ord.po) : ""}${job}</span></span>
          <a class="iv-pricelist" href="/accounting/price-list/branch?branch=${encodeURIComponent(ord.branchCode)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">📋 Price List</a>
          <span class="iv-inv-tags">${orderTags(ord)}</span>
        </summary>
        <div class="iv-inv-body" data-ord="${esc(ord.orderNumber)}"></div>
      </details>`;
  }

  function branchNode(br: Branch): string {
    return `
      <details class="iv-branch" data-branch="${esc(br.branchCode)}" data-search="${esc((br.branchName + " " + br.branchCode).toLowerCase())}">
        <summary>
          <span class="iv-chev" aria-hidden="true">›</span>
          <span><span class="iv-branch-name">${esc(br.branchName)}</span> <span class="iv-inv-sub">#${esc(br.branchCode)}</span></span>
          <span class="iv-branch-tags">
            <span class="pill pill-grey">${br.activeCount} active / ${br.orderCount}</span>
            <span class="pill pill-brand">${br.matched} matched</span>
            ${br.atRisk > 0 ? `<span class="pill pill-red">${money(br.atRisk)} at risk</span>` : '<span class="pill pill-green">✓ in tolerance</span>'}
          </span>
        </summary>
        <div class="iv-branch-body">${br.orders.map(orderNode).join("")}</div>
      </details>`;
  }

  function officeNode(off: Office): string {
    return `
      <details class="iv-office" data-office="${esc(off.office)}">
        <summary>
          <span class="iv-chev" aria-hidden="true">›</span>
          <span class="iv-office-name">${esc(off.office)}</span>
          <span class="iv-mini">
            <div><strong>${off.activeCount}</strong><span>Active</span></div>
            <div><strong>${off.matched}</strong><span>Matched</span></div>
            <div><strong>${money(off.atRisk)}</strong><span>At Risk</span></div>
            <div><strong>${off.flaggedLines}</strong><span>Flagged</span></div>
          </span>
        </summary>
        <div class="iv-office-body">${off.branches.map(branchNode).join("")}</div>
      </details>`;
  }

  mount.innerHTML = offices.map(officeNode).join("");

  // Lazy-render order bodies on first expand.
  const ordByNumber = new Map<string, Order>();
  offices.forEach((o) => o.branches.forEach((b) => b.orders.forEach((ord) => ordByNumber.set(ord.orderNumber, ord))));
  mount.querySelectorAll<HTMLDetailsElement>(".iv-inv").forEach((det) => {
    det.addEventListener("toggle", async () => {
      if (!det.open) return;
      const body = det.querySelector(".iv-inv-body") as HTMLElement;
      if (body.dataset.rendered) return;
      body.dataset.rendered = "1"; // guard against double-fetch on rapid toggles
      const ord = ordByNumber.get(body.dataset.ord!);
      if (!ord) return;
      body.innerHTML = '<p class="iv-disp-lead">Loading lines…</p>';
      try {
        const res = await fetch(`/api/order-audit/lines?order=${encodeURIComponent(ord.orderNumber)}`);
        const r = await res.json();
        if (!r.ok) { body.innerHTML = `<p class="iv-disp-lead">Could not load lines: ${esc(r.error_description || r.error || "error")}</p>`; return; }
        ord.lines = r.lines || [];
        body.innerHTML = orderBody(ord);
      } catch {
        body.innerHTML = '<p class="iv-disp-lead">Could not load lines — network error.</p>';
        body.dataset.rendered = ""; // allow retry on next open
      }
    });
  });

  /* ---- filters ---- */
  const search = document.getElementById("iv-search") as HTMLInputElement;
  const officeSel = document.getElementById("iv-office") as HTMLSelectElement;
  const statusSel = document.getElementById("iv-status") as HTMLSelectElement;
  const tolSel = document.getElementById("iv-tol") as HTMLSelectElement;
  const matchSel = document.getElementById("iv-match") as HTMLSelectElement;
  function applyFilter() {
    const q = search.value.trim().toLowerCase();
    const off = officeSel.value;
    const status = statusSel.value;
    const tol = tolSel.value;
    const match = matchSel.value;
    mount.querySelectorAll<HTMLElement>(".iv-office").forEach((oEl) => {
      const officeOk = !off || oEl.dataset.office === off;
      let officeHas = false;
      oEl.querySelectorAll<HTMLElement>(".iv-branch").forEach((bEl) => {
        let branchHas = false;
        bEl.querySelectorAll<HTMLElement>(".iv-inv").forEach((iEl) => {
          const matched = iEl.dataset.matched === "1";
          const disp = iEl.dataset.disp || "active";
          const worst = parseFloat(iEl.dataset.worst || "0");
          const noprice = parseInt(iEl.dataset.noprice || "0", 10);
          const statusOk = !status ? true : disp === status;
          const tolOk = !tol ? true : tol === "noprice" ? noprice > 0 : worst >= parseFloat(tol);
          const matchOk = match === "matched" ? matched : match === "unmatched" ? !matched : true;
          const qOk = !q || (iEl.dataset.search || "").includes(q) || (bEl.dataset.search || "").includes(q);
          const ok = officeOk && statusOk && tolOk && matchOk && qOk;
          iEl.style.display = ok ? "" : "none";
          if (ok) branchHas = true;
        });
        bEl.style.display = branchHas ? "" : "none";
        if (branchHas) officeHas = true;
      });
      oEl.style.display = officeHas ? "" : "none";
    });
  }
  [search, officeSel, tolSel, matchSel].forEach((el) => el?.addEventListener("input", applyFilter));
  // Status changes the server-side load scope (active = fast 181-order window; archived/all
  // = heavier full load), so reload with ?status= rather than filter client-side.
  statusSel?.addEventListener("change", () => {
    const p = new URLSearchParams(window.location.search);
    p.set("status", statusSel.value);
    window.location.search = p.toString();
  });
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
}
