// Order Audit — PE Office → Vendor/Branch → Order → Line drill-down.
// Read-only verification + coverage view (orders are pre-pricing). Lazy-renders
// order lines on expand. Reads ?office=/?branch= to land pre-filtered.

interface OrdLine { lineId: string; lineKey: string; itemNumber: string; itemDescription: string; qty: number; uom: string; negotiatedPrice: number | null; covered: boolean; }
interface Order { orderNumber: string; po: string; orderedOn: string; deliveryRequestedFor: string; orderStatus: string; orderType: string; orderTotal: number; branchCode: string; branchName: string; office: string; lineCount: number; coveredLines: number; uncoveredLines: number; matched: boolean; jobNumber: string; clientName: string; jobCategory: string; lines: OrdLine[]; }
interface Branch { branchCode: string; branchName: string; office: string; orderCount: number; matched: number; orderTotal: number; coveredLines: number; uncoveredLines: number; orders: Order[]; }
interface Office { office: string; branchCount: number; orderCount: number; matched: number; orderTotal: number; coveredLines: number; uncoveredLines: number; branches: Branch[]; }

const root = document.querySelector(".iv") as HTMLElement | null;
const dataEl = document.getElementById("iv-data");
const mount = document.getElementById("iv-tree");

if (root && dataEl && mount) {
  const { offices } = JSON.parse(dataEl.textContent || "{}") as { offices: Office[] };

  const money = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
  const money2 = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const esc = (s: string) => String(s ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c] || c));
  const statusPill = (s: string) => {
    const l = s.toLowerCase();
    if (l === "canceled" || l === "cancelled") return "pill-grey";
    if (l.includes("requested") || l === "in progress" || l === "processed" || l === "partial") return "pill-yellow";
    return "pill-green"; // delivered / picked up / pickup completed
  };

  /* ---- line table (lazy) ---- */
  function orderBody(ord: Order): string {
    const rows = ord.lines.map((l) => `
      <tr class="iv-ln${l.covered ? " is-covered" : ""}">
        <td class="iv-sku">${esc(l.itemNumber)}</td>
        <td>${esc(l.itemDescription)}</td>
        <td class="num">${l.qty}</td>
        <td>${esc(l.uom)}</td>
        <td>${l.covered ? `${money2(l.negotiatedPrice ?? 0)} <span class="pill pill-green">Negotiated</span>` : '<span class="pill pill-red">No agreement</span>'}</td>
      </tr>`).join("");
    return `
      <table class="iv-table">
        <thead><tr><th>Item</th><th>Description</th><th class="num">Qty</th><th>UOM</th><th>Negotiated coverage</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5">No lines.</td></tr>'}</tbody>
      </table>`;
  }

  /* ---- tree render ---- */
  function orderTags(ord: Order): string {
    return [
      ord.orderStatus ? `<span class="pill ${statusPill(ord.orderStatus)}">${esc(ord.orderStatus)}</span>` : "",
      ord.matched ? '<span class="pill pill-brand">✓ Job matched</span>' : '<span class="pill pill-yellow">No PE job</span>',
      ord.uncoveredLines > 0 ? `<span class="pill pill-red">${ord.uncoveredLines}/${ord.lineCount} uncovered</span>` : '<span class="pill pill-green">✓ Fully covered</span>',
      ord.orderTotal > 0 ? `<span class="pill pill-grey">${money(ord.orderTotal)}</span>` : "",
    ].filter(Boolean).join("");
  }
  function orderNode(ord: Order): string {
    const job = ord.matched ? ` · <span class="iv-job">${esc(ord.jobNumber)}${ord.clientName ? " · " + esc(ord.clientName) : ""}${ord.jobCategory ? " · " + esc(ord.jobCategory) : ""}</span>` : "";
    const dates = [ord.orderedOn, ord.deliveryRequestedFor ? "→ " + ord.deliveryRequestedFor : ""].filter(Boolean).join(" ");
    const search = (ord.orderNumber + " " + ord.po + " " + ord.jobNumber + " " + ord.clientName + " " + ord.lines.map((l) => l.itemNumber + " " + l.itemDescription).join(" ")).toLowerCase();
    return `
      <details class="iv-inv" data-search="${esc(search)}" data-matched="${ord.matched ? "1" : "0"}" data-uncovered="${ord.uncoveredLines}">
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
            <span class="pill pill-grey">${br.orderCount} orders</span>
            <span class="pill pill-brand">${br.matched} matched</span>
            ${br.uncoveredLines ? `<span class="pill pill-red">${br.uncoveredLines} uncovered</span>` : '<span class="pill pill-green">✓ covered</span>'}
            ${br.orderTotal > 0 ? `<span class="pill pill-grey">${money(br.orderTotal)}</span>` : ""}
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
            <div><strong>${off.orderCount}</strong><span>Orders</span></div>
            <div><strong>${off.matched}</strong><span>Matched</span></div>
            <div><strong>${money(off.orderTotal)}</strong><span>Ordered</span></div>
            <div><strong>${off.uncoveredLines}</strong><span>Uncovered</span></div>
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
    det.addEventListener("toggle", () => {
      if (!det.open) return;
      const body = det.querySelector(".iv-inv-body") as HTMLElement;
      if (body.dataset.rendered) return;
      const ord = ordByNumber.get(body.dataset.ord!);
      if (!ord) return;
      body.innerHTML = orderBody(ord);
      body.dataset.rendered = "1";
    });
  });

  /* ---- filters ---- */
  const search = document.getElementById("iv-search") as HTMLInputElement;
  const officeSel = document.getElementById("iv-office") as HTMLSelectElement;
  const matchSel = document.getElementById("iv-match") as HTMLSelectElement;
  const covSel = document.getElementById("iv-cov") as HTMLSelectElement;
  function applyFilter() {
    const q = search.value.trim().toLowerCase();
    const off = officeSel.value;
    const match = matchSel.value;
    const cov = covSel.value;
    root!.classList.toggle("iv-uncov-only", cov === "uncovered"); // CSS hides covered line rows
    mount.querySelectorAll<HTMLElement>(".iv-office").forEach((oEl) => {
      const officeOk = !off || oEl.dataset.office === off;
      let officeHas = false;
      oEl.querySelectorAll<HTMLElement>(".iv-branch").forEach((bEl) => {
        let branchHas = false;
        bEl.querySelectorAll<HTMLElement>(".iv-inv").forEach((iEl) => {
          const matched = iEl.dataset.matched === "1";
          const uncovered = parseInt(iEl.dataset.uncovered || "0", 10);
          const matchOk = match === "matched" ? matched : match === "unmatched" ? !matched : true;
          const covOk = cov === "uncovered" ? uncovered > 0 : cov === "covered" ? uncovered === 0 : true;
          const qOk = !q || (iEl.dataset.search || "").includes(q) || (bEl.dataset.search || "").includes(q);
          const ok = officeOk && matchOk && covOk && qOk;
          iEl.style.display = ok ? "" : "none";
          if (ok) branchHas = true;
        });
        bEl.style.display = branchHas ? "" : "none";
        if (branchHas) officeHas = true;
      });
      oEl.style.display = officeHas ? "" : "none";
    });
  }
  [search, officeSel, matchSel, covSel].forEach((el) => el?.addEventListener("input", applyFilter));
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
