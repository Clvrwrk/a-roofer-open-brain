// Price Agreement Audit — PE Office → Vendor/Branch → Item Category → Item drill-down.
// Lazy-renders a branch's category/item body on first expand. Mirrors the Invoice Audit
// tree so the two dashboards behave identically.

interface PaItem { itemNumber: string; description: string; uom: string; unitPrice: number; hasNegotiated: boolean; apiPrice: number | null; apiUom: string; uomMismatch: boolean; variancePct: number | null; changeTier: string; changePct: number | null; changePrior: number | null; imageUrl: string; categoryKey: string; }
interface PaCategory { key: string; label: string; sortOrder: number; itemCount: number; items: PaItem[]; }
interface PaBranch {
  branchCode: string; branchName: string; office: string;
  agreementId: number | null; agreementNumber: string; versionLabel: string;
  effective: string; expiry: string; lifecycle: string; daysToExpiry: number | null;
  ceoVerified: boolean; salesRep: string; itemCount: number; covered: boolean;
  apiNonNegotiated: boolean; needsAction: boolean; renewalRequested: boolean; renewalRequestedAt: string;
  agreementPdfUrl: string;
  categories: PaCategory[];
}
interface PaOffice {
  office: string; totalBranches: number; coveredBranches: number; coverageRate: number;
  matchedBranchCount: number; itemCount: number; expired: number; expiring: number; apiBranches: number;
  branches: PaBranch[];
}

const root = document.querySelector(".pa") as HTMLElement | null;
const dataEl = document.getElementById("pa-data");
const mount = document.getElementById("pa-tree");

if (root && dataEl && mount) {
  const { offices } = JSON.parse(dataEl.textContent || "{}") as { offices: PaOffice[] };

  const money2 = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pctText = (n: number) => Math.round(n * 100) + "%";
  const esc = (s: string) => String(s ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c] || c));
  const lifeCls = (l: string) => (l === "expired" ? "pill-red" : l === "expiring" ? "pill-orange" : l === "active" ? "pill-green" : "pill-grey");
  const lifeLab = (l: string) => (l === "expired" ? "Expired" : l === "expiring" ? "Expiring" : l === "active" ? "Active" : "No expiry");
  const daysText = (b: PaBranch) => (b.daysToExpiry == null ? "" : b.lifecycle === "expired" ? `${Math.abs(b.daysToExpiry)}d ago` : `${b.daysToExpiry}d left`);
  const covCls = (r: number) => (r >= 0.75 ? "pill-green" : r >= 0.4 ? "pill-yellow" : "pill-red");

  /* ---- branch body (lazy): category sections + item tables ---- */
  function branchBody(br: PaBranch): string {
    if (br.apiNonNegotiated && !br.agreementId) {
      return `<div class="pa-cats"><p class="pa-disp-lead">API price list — non-negotiated. No negotiated catalog to audit for this branch.</p></div>`;
    }
    if (!br.categories.length) return `<div class="pa-cats"><p class="pa-disp-lead">No priced items on this agreement.</p></div>`;
    const sections = br.categories.map((c) => `
      <details class="pa-cat" data-cat="${esc(c.key)}">
        <summary><span class="pa-chev" aria-hidden="true">›</span><b>${esc(c.label)}</b>
          <span class="pa-cat-tags"><span class="pill pill-grey">${c.itemCount} items</span></span></summary>
        <table class="pa-itable"><thead><tr><th></th><th>Item</th><th>Description</th><th>UOM</th><th class="num">Negotiated Price</th><th class="num">API Price</th><th class="num">Var %</th></tr></thead>
          <tbody>${c.items.map((it) => {
            const varCls = it.variancePct == null ? "" : Math.abs(it.variancePct) <= 3 ? "pa-var-ok" : Math.abs(it.variancePct) <= 6 ? "pa-var-mid" : "pa-var-hi";
            // Version-comparison badge: change vs the prior agreement version (migration 138).
            const chgBadge = it.changeTier === "critical" ? `<span class="pa-chg pa-chg-hi" title="Prior ${it.changePrior != null ? money2(it.changePrior) : "—"} → ${money2(it.unitPrice)}">▲ ${it.changePct != null ? "+" + it.changePct.toFixed(1) + "%" : ""} critical</span>`
              : it.changeTier === "review" ? `<span class="pa-chg pa-chg-mid" title="Prior ${it.changePrior != null ? money2(it.changePrior) : "—"} → ${money2(it.unitPrice)}">▲ ${it.changePct != null ? "+" + it.changePct.toFixed(1) + "%" : ""} review</span>`
              : it.changeTier === "decrease" ? `<span class="pa-chg pa-chg-ok" title="Prior ${it.changePrior != null ? money2(it.changePrior) : "—"} → ${money2(it.unitPrice)}">▼ ${it.changePct != null ? it.changePct.toFixed(1) + "%" : ""}</span>` : "";
            return `
            <tr>
              <td class="pa-imgcell">${it.imageUrl ? `<img class="pa-imgchip" src="${esc(it.imageUrl)}" data-full="${esc(it.imageUrl)}" alt="" loading="lazy" />` : '<span class="pa-imgph"></span>'}</td>
              <td class="pa-sku">${esc(it.itemNumber)}</td>
              <td>${esc(it.description)}</td>
              <td>${esc(it.uom)}</td>
              <td class="num">${it.hasNegotiated ? money2(it.unitPrice) + " " + chgBadge : '<span class="pa-dash">—</span>'}</td>
              <td class="num">${it.apiPrice == null ? '<span class="pa-dash">—</span>' : money2(it.apiPrice)}</td>
              <td class="num ${varCls}">${it.uomMismatch ? '<span class="pa-chg pa-chg-mid" title="Negotiated and API units could not be aligned to one UOM — variance withheld">UOM ?</span>' : it.variancePct == null ? "—" : (it.variancePct >= 0 ? "+" : "") + it.variancePct.toFixed(1) + "%"}</td>
            </tr>`; }).join("")}</tbody>
        </table>
      </details>`).join("");
    return `<div class="pa-cats">${sections}</div>`;
  }

  function branchTags(br: PaBranch): string {
    const tags: string[] = [];
    // Purple Agreement pill — opens the agreement PDF when one is on file (Chris).
    if (br.agreementNumber) tags.push(br.agreementPdfUrl
      ? `<a class="pill pa-pill-agreement" href="${esc(br.agreementPdfUrl)}" target="_blank" rel="noopener" title="Open agreement PDF" onclick="event.stopPropagation()">PA ${esc(br.agreementNumber)}</a>`
      : `<span class="pill pa-pill-agreement is-nopdf" title="No agreement PDF on file yet">PA ${esc(br.agreementNumber)}</span>`);
    if (br.agreementId) tags.push(`<span class="pill ${lifeCls(br.lifecycle)}">${lifeLab(br.lifecycle)}${daysText(br) ? " · " + daysText(br) : ""}</span>`);
    if (br.ceoVerified) tags.push('<span class="pill pill-green">CEO ✓</span>');
    if (br.apiNonNegotiated) tags.push('<span class="pill pill-grey" title="Covered by an ABC API price list — non-negotiated">API · non-negotiated</span>');
    if (br.itemCount) tags.push(`<span class="pill pill-grey">${br.itemCount} items</span>`);
    if (br.renewalRequested) tags.push(`<span class="pill pill-yellow">Renewal requested${br.renewalRequestedAt ? " · " + br.renewalRequestedAt : ""}</span>`);
    return tags.join("");
  }

  function branchNode(br: PaBranch): string {
    const renew = br.needsAction && !br.renewalRequested
      ? `<button class="pa-renew" data-renew="${br.agreementId}" data-ag="${esc(br.agreementNumber)}" data-rep="${esc(br.salesRep)}" data-exp="${esc(br.expiry)}" data-scope="Branch ${esc(br.branchCode)}" onclick="event.stopPropagation()">Request renewal</button>`
      : "";
    return `
      <details class="pa-branch" data-life="${br.lifecycle}" data-needs="${br.needsAction ? 1 : 0}" data-api="${br.apiNonNegotiated ? 1 : 0}" data-covered="${br.covered ? 1 : 0}"
        data-search="${esc((br.branchName + " " + br.branchCode + " " + br.agreementNumber + " " + br.salesRep).toLowerCase())}">
        <summary>
          <span class="pa-chev" aria-hidden="true">›</span>
          <span class="pa-branch-id"><span class="pa-branch-name">${esc(br.branchName)}</span> <span class="pa-sub">#${esc(br.branchCode)}</span></span>
          ${renew}
          <span class="pa-branch-tags">${branchTags(br)}</span>
        </summary>
        <div class="pa-branch-body" data-branch="${esc(br.office + "|" + br.branchCode)}"></div>
      </details>`;
  }

  function officeNode(off: PaOffice): string {
    const covered = off.office !== "Unassigned";
    return `
      <details class="pa-office" data-office="${esc(off.office)}">
        <summary>
          <span class="pa-chev" aria-hidden="true">›</span>
          <span class="pa-office-name">${esc(off.office)}</span>
          <span class="pa-mini">
            ${covered ? `<div><strong><span class="pill ${covCls(off.coverageRate)}">${pctText(off.coverageRate)}</span></strong><span>Coverage</span></div>` : ""}
            <div><strong>${off.coveredBranches}/${off.totalBranches}</strong><span>Covered</span></div>
            <div><strong>${off.expired}</strong><span>Expired</span></div>
            <div><strong>${off.expiring}</strong><span>Expiring</span></div>
            <div><strong>${off.itemCount.toLocaleString()}</strong><span>Items</span></div>
          </span>
        </summary>
        <div class="pa-office-body">${off.branches.map(branchNode).join("")}</div>
      </details>`;
  }

  mount.innerHTML = offices.map(officeNode).join("") || `<p class="pa-empty">No price agreements found.</p>`;

  // Lazy-render branch bodies on first expand.
  const branchByKey = new Map<string, PaBranch>();
  offices.forEach((o) => o.branches.forEach((b) => branchByKey.set(o.office + "|" + b.branchCode, b)));
  function bindRenew(scopeEl: HTMLElement) {
    scopeEl.querySelectorAll<HTMLButtonElement>("[data-renew]").forEach((b) =>
      b.addEventListener("click", async () => {
        const id = Number(b.dataset.renew);
        b.disabled = true; b.textContent = "Requesting…";
        try {
          const res = await fetch("/api/price-agreement/request-renewal", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ agreementId: id, agreementNumber: b.dataset.ag, scope: b.dataset.scope, salesRep: b.dataset.rep, expiry: b.dataset.exp }),
          });
          const r = await res.json();
          if (r.ok) { b.outerHTML = `<span class="pill pill-yellow">Renewal requested</span>`; toast("Renewal request drafted for " + (b.dataset.ag || id) + " — queued for approval (no auto-send)"); }
          else { b.disabled = false; b.textContent = "Request renewal"; toast("Failed: " + (r.error_description || r.error || "error")); }
        } catch { b.disabled = false; b.textContent = "Request renewal"; toast("Network error"); }
      }));
  }
  mount.querySelectorAll<HTMLDetailsElement>(".pa-branch").forEach((det) => {
    bindRenew(det.querySelector("summary")!);
    det.addEventListener("toggle", () => {
      if (!det.open) return;
      const body = det.querySelector(".pa-branch-body") as HTMLElement;
      if (body.dataset.rendered) return;
      const br = branchByKey.get(body.dataset.branch!);
      if (!br) return;
      body.innerHTML = branchBody(br);
      body.dataset.rendered = "1";
    });
  });

  /* ---- filters ---- */
  const search = document.getElementById("pa-search") as HTMLInputElement;
  const officeSel = document.getElementById("pa-office") as HTMLSelectElement;
  const filterSel = document.getElementById("pa-filter") as HTMLSelectElement;
  function applyFilter() {
    const q = search.value.trim().toLowerCase();
    const off = officeSel.value;
    const f = filterSel.value;
    mount.querySelectorAll<HTMLElement>(".pa-office").forEach((oEl) => {
      const officeOk = !off || oEl.dataset.office === off;
      let officeHas = false;
      oEl.querySelectorAll<HTMLElement>(".pa-branch").forEach((bEl) => {
        const life = bEl.dataset.life || "";
        const needs = bEl.dataset.needs === "1";
        const api = bEl.dataset.api === "1";
        const covered = bEl.dataset.covered === "1";
        const fOk = !f ? true
          : f === "needs" ? needs
          : f === "expired" ? life === "expired"
          : f === "expiring" ? life === "expiring"
          : f === "active" ? (life === "active" || life === "no_expiry") && covered
          : f === "api" ? api
          : true;
        const qOk = !q || (bEl.dataset.search || "").includes(q);
        const ok = officeOk && fOk && qOk;
        bEl.style.display = ok ? "" : "none";
        if (ok) officeHas = true;
      });
      oEl.style.display = officeHas || (officeOk && !q && !f) ? (officeHas ? "" : "none") : "none";
    });
  }
  [search, officeSel, filterSel].forEach((el) => el?.addEventListener("input", applyFilter));
  applyFilter();

  /* ---- theme toggle (shared pattern) ---- */
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  function applyTheme(pref: string) {
    root!.dataset.theme = pref === "system" ? (mq.matches ? "dark" : "light") : pref;
    root!.dataset.pref = pref;
    root!.querySelectorAll<HTMLButtonElement>(".pa-theme button").forEach((b) => b.classList.toggle("is-active", b.dataset.setTheme === pref));
  }
  let pref = "system";
  try { pref = localStorage.getItem("paTheme") || "system"; } catch {}
  applyTheme(pref);
  root.querySelectorAll<HTMLButtonElement>(".pa-theme button").forEach((b) =>
    b.addEventListener("click", () => { try { localStorage.setItem("paTheme", b.dataset.setTheme!); } catch {} applyTheme(b.dataset.setTheme!); }));
  mq.addEventListener("change", () => { if (root!.dataset.pref === "system") applyTheme("system"); });

  /* ---- image chip: click to enlarge, click again to close (Chris) ---- */
  root.addEventListener("click", (e) => {
    const img = (e.target as HTMLElement).closest(".pa-imgchip") as HTMLImageElement | null;
    if (!img) return;
    e.preventDefault(); e.stopPropagation();
    let ov = document.getElementById("pa-imgov") as HTMLElement | null;
    if (!ov) {
      ov = document.createElement("div"); ov.id = "pa-imgov"; ov.className = "pa-imgov";
      ov.addEventListener("click", () => ov!.classList.remove("show"));
      document.body.appendChild(ov);
    }
    ov.innerHTML = `<img src="${img.dataset.full}" alt="" />`;
    ov.classList.add("show");
  });

  /* ---- toast ---- */
  let timer: number | undefined;
  const toastEl = document.getElementById("pa-toast")!;
  function toast(msg: string) { toastEl.textContent = msg; toastEl.classList.add("show"); window.clearTimeout(timer); timer = window.setTimeout(() => toastEl.classList.remove("show"), 2600); }
}
