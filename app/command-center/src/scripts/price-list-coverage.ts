/* Price List Coverage tree — vendor → branch → non-negotiated items.
   In-scope = within a PE office 2h drive-time, or ordered at a no-agreement branch.
   Branch coverage pill: green=full / yellow=partial / red=none.
   "Request Price List" drafts an approval email (rep + branch mgr, FYI Lucinda/Roberto)
   and logs to the requests tracker. Year filter + theme toggle + map-click filtering. */

const dataEl = document.getElementById("plc2-data");
const root = document.getElementById("aq") as HTMLElement | null;
if (dataEl && root) {
  const P = JSON.parse(dataEl.textContent || "{}");
  const money = (n: number) => "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });

  /* ---- theme ---- */
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  function applyTheme(pref: string) {
    const eff = pref === "system" ? (mq.matches ? "dark" : "light") : pref;
    root!.dataset.theme = eff; root!.dataset.pref = pref;
    root!.querySelectorAll<HTMLButtonElement>(".theme button").forEach((b) => b.classList.toggle("is-active", b.dataset.setTheme === pref));
  }
  let tpref = "system";
  try { tpref = localStorage.getItem("aqPlcCoverageTheme") || "system"; } catch (e) {}
  applyTheme(tpref);
  root.querySelectorAll<HTMLButtonElement>(".theme button").forEach((b) =>
    b.addEventListener("click", () => { const p = b.dataset.setTheme!; try { localStorage.setItem("aqPlcCoverageTheme", p); } catch (e) {} applyTheme(p); }));
  mq.addEventListener("change", () => { if (root!.dataset.pref === "system") applyTheme("system"); });

  /* ---- state ---- */
  const allBranches: any[] = P.vendors.flatMap((v: any) => v.branches);
  let year = Math.max(...P.years);
  let scopeOnly = true;
  const f = { vendor: "", office: "", state: "", coverage: "" } as Record<string, string>;
  const openV = new Set<string>(P.vendors.map((v: any) => v.vendor)); // vendors open by default
  const openB = new Set<string>();
  const reqOverride: Record<string, any> = {}; // branchNo -> {requestStatus, requestedDate, daysOpen, nextFollowUp}

  /* ---- controls ---- */
  const fyPill = document.getElementById("plc2-fy")!;
  const yearSel = document.getElementById("plc2-year") as HTMLSelectElement;
  P.years.slice().sort((a: number, b: number) => b - a).forEach((y: number) => yearSel.add(new Option("FY " + y, String(y))));
  yearSel.value = String(year);
  yearSel.addEventListener("input", () => { year = Number(yearSel.value); render(); });

  const uniq = (xs: string[]) => Array.from(new Set(xs.filter(Boolean))).sort();
  const filtersEl = document.getElementById("plc2-filters")!;
  const mkSel = (col: string, label: string, opts: string[]) =>
    `<select class="aq-select" data-col="${col}"><option value="">${label}</option>${opts.map((o) => `<option value="${o}">${o}</option>`).join("")}</select>`;
  filtersEl.innerHTML =
    mkSel("vendor", "All vendors", uniq(allBranches.map((b) => b.vendor))) +
    mkSel("office", "All PE offices", uniq(allBranches.map((b) => b.office))) +
    mkSel("state", "All states", uniq(allBranches.map((b) => b.state))) +
    mkSel("coverage", "All coverage", ["full", "partial", "none"]);
  filtersEl.querySelectorAll<HTMLSelectElement>("select").forEach((s) =>
    s.addEventListener("input", () => { f[s.dataset.col!] = s.value; render(); }));

  const search = document.getElementById("plc2-search") as HTMLInputElement;
  search.addEventListener("input", render);
  const scopeBox = document.getElementById("plc2-scope") as HTMLInputElement;
  scopeBox.addEventListener("input", () => { scopeOnly = scopeBox.checked; render(); });

  // Scoped deep-link: land pre-filtered from the map popup / side card.
  const params = new URLSearchParams(window.location.search);
  const dlOffice = params.get("office");
  const dlBranch = params.get("branch");
  if (dlOffice) {
    const want = decodeURIComponent(dlOffice).toLowerCase();
    const match = uniq(allBranches.map((b) => b.office)).find((o) => o.toLowerCase() === want || o.toLowerCase().includes(want));
    if (match) {
      f.office = match;
      const sel = filtersEl.querySelector<HTMLSelectElement>('select[data-col="office"]');
      if (sel) sel.value = match;
    }
  }
  if (dlBranch) { search.value = decodeURIComponent(dlBranch); }

  /* ---- helpers ---- */
  const fyFactor = () => P.yearFactors[year] ?? 1;
  const reqOf = (b: any) => reqOverride[b.branchNo] || b;
  const coveredForKpi = (b: any) => b.listStatus !== "none" || reqOf(b).requestStatus === "requested";
  const branchSpend = (b: any) => b.items.reduce((s: number, it: any) => s + it.spend, 0) * fyFactor();
  const matchSearch = (b: any, q: string) =>
    !q || [b.vendor, b.branchNo, b.branchName, b.office, b.state, ...b.items.map((i: any) => i.sku + " " + i.desc)].join(" ").toLowerCase().includes(q);

  function visibleBranches() {
    const q = search.value.trim().toLowerCase();
    return allBranches.filter((b) =>
      (!scopeOnly || b.inScope) &&
      (!f.vendor || b.vendor === f.vendor) &&
      (!f.office || b.office === f.office) &&
      (!f.state || b.state === f.state) &&
      (!f.coverage || b.listStatus === f.coverage) &&
      matchSearch(b, q));
  }

  const STATUS_ORDER: Record<string, number> = { none: 0, partial: 1, full: 2 };
  function sortBranches(list: any[]) {
    return list.slice().sort((a, b) =>
      (a.inScope === b.inScope ? 0 : a.inScope ? -1 : 1) ||
      (a.inDriveTime === b.inDriveTime ? 0 : a.inDriveTime ? -1 : 1) ||
      (STATUS_ORDER[a.listStatus] - STATUS_ORDER[b.listStatus]) ||
      a.branchNo.localeCompare(b.branchNo));
  }

  /* ---- KPIs ---- */
  function renderKpis() {
    const inScope = allBranches.filter((b) => b.inScope);
    const covered = inScope.filter(coveredForKpi).length;
    const pct = inScope.length ? Math.round((covered / inScope.length) * 100) : 0;
    const pending = allBranches.filter((b) => reqOf(b).requestStatus === "requested").length;
    const K = [
      { lab: "In-Scope Coverage", val: pct + "%", go: "target 100%" },
      { lab: "In-Scope Branches", val: String(inScope.length), go: "≤2h or ordered" },
      { lab: "Full Lists", val: String(inScope.filter((b) => b.listStatus === "full").length), go: "Green →", cov: "full" },
      { lab: "Partial", val: String(inScope.filter((b) => b.listStatus === "partial").length), go: "Yellow →", cov: "partial" },
      { lab: "No List", val: String(inScope.filter((b) => b.listStatus === "none").length), go: "Red →", cov: "none" },
      { lab: "Pending Requests", val: String(pending), go: "Tracker ↓" },
    ];
    const el = document.getElementById("aq-kpis")!;
    el.innerHTML = K.map((k, i) => `<a class="aq-kpi" href="#" data-i="${i}" data-cov="${(k as any).cov || ""}"><span class="lab">${k.lab}</span><span class="val">${k.val}</span><span class="go">${k.go}</span></a>`).join("");
    el.querySelectorAll<HTMLElement>(".aq-kpi").forEach((card) =>
      card.addEventListener("click", (e) => {
        e.preventDefault();
        const cov = card.dataset.cov || "";
        const sel = filtersEl.querySelector<HTMLSelectElement>('select[data-col="coverage"]')!;
        if (cov) { f.coverage = f.coverage === cov ? "" : cov; sel.value = f.coverage; }
        if (card.dataset.i === "5") document.querySelector(".plc2-tracker")!.scrollIntoView({ behavior: "smooth", block: "start" });
        render();
      }));
  }

  /* ---- tree ---- */
  function pill(cls: string, txt: string) { return `<span class="pill ${cls}">${txt}</span>`; }

  function reqCell(b: any) {
    const r = reqOf(b);
    if (r.requestStatus === "requested") return pill("pill-new", "Requested · " + r.daysOpen + "d");
    if (b.inScope && b.listStatus === "none") return pill("pill-red", "Not requested");
    return `<span class="aq-sub">—</span>`;
  }

  function render() {
    fyPill.textContent = "FY " + year;
    renderKpis();
    const branches = visibleBranches();
    const byVendor = new Map<string, any[]>();
    branches.forEach((b) => { if (!byVendor.has(b.vendor)) byVendor.set(b.vendor, []); byVendor.get(b.vendor)!.push(b); });

    let html = "";
    let shown = 0;
    Array.from(byVendor.keys()).sort().forEach((vendor) => {
      const list = sortBranches(byVendor.get(vendor)!);
      const vOpen = openV.has(vendor);
      const inScopeN = list.filter((b) => b.inScope).length;
      const gaps = list.filter((b) => b.listStatus === "none").length;
      html += `<tr class="plc2-vendor ${vOpen ? "plc2-open" : ""}" data-vendor="${vendor}">
        <td><span class="plc2-name"><span class="plc2-caret">▶</span>${vendor} <span class="plc2-sub">${list.length} branches · ${inScopeN} in-scope</span></span></td>
        <td></td><td></td>
        <td>${gaps ? pill("pill-red", gaps + " no list") : pill("pill-green", "all covered")}</td>
        <td class="num"></td><td class="num">${money(list.reduce((s, b) => s + branchSpend(b), 0))}</td><td></td></tr>`;
      if (!vOpen) return;
      list.forEach((b) => {
        shown++;
        const bOpen = openB.has(b.branchNo);
        html += `<tr class="plc2-branch ${bOpen ? "plc2-open" : ""}" data-branch="${b.branchNo}">
          <td><span class="plc2-name"><span class="plc2-caret">▶</span><span>${b.branchNo}${b.branchName ? " · " + b.branchName : ""}<br><span class="plc2-scope-flag ${b.inScope ? "" : "out"}">${b.inDriveTime ? "≤2h drive-time" : b.hasOrder ? "ordered · no agreement" : "out of scope"}</span></span></span></td>
          <td>${pill(b.listCls, b.office)}</td>
          <td>${pill(b.inDriveTime ? "pill-new" : "pill-grey", b.inDriveTime ? "≤2h" : ">2h")}</td>
          <td>${pill(b.listCls, b.coverageLabel)}</td>
          <td class="num">${b.nonNegCount} / ${b.itemCount}</td>
          <td class="num">${money(branchSpend(b))}</td>
          <td>${reqCell(b)}</td></tr>`;
        if (!bOpen) return;
        const nonNeg = b.items.filter((it: any) => !it.negotiated);
        if (b.listStatus === "full") {
          html += `<tr class="plc2-item"><td colspan="7"><span class="aq-sub">✓ Fully negotiated — no open items.</span></td></tr>`;
        } else {
          nonNeg.forEach((it: any) => {
            html += `<tr class="plc2-item">
              <td><span class="plc2-name">${it.sku} · ${it.desc}</span></td>
              <td></td><td></td>
              <td>${pill(it.sourceCls, it.source)}</td>
              <td class="num">${it.qty}</td>
              <td class="num">${money(it.spend * fyFactor())}</td><td></td></tr>`;
          });
        }
        const r = reqOf(b);
        const reqText = r.requestStatus === "requested"
          ? `<span class="plc2-req-cta">Requested <b>${r.requestedDate}</b> · ${r.daysOpen}d open · next follow-up <b>${r.nextFollowUp}</b></span>`
          : `<span class="plc2-req-cta">${b.listStatus === "none" ? "<b>No negotiated price list.</b> " : ""}Draft a price-list request to the sales rep &amp; branch manager (FYI Lucinda, Roberto).</span>`;
        html += `<tr class="plc2-reqrow"><td colspan="7"><div class="plc2-req-cta">${reqText}
          ${r.requestStatus === "requested" ? "" : `<button class="btn btn-primary btn-small" data-request="${b.branchNo}">Request Price List</button>`}</div></td></tr>`;
      });
    });

    document.getElementById("plc2-body")!.innerHTML = html;
    (document.getElementById("plc2-empty") as HTMLElement).hidden = shown !== 0;
    document.getElementById("plc2-count")!.textContent = `${shown} ${scopeOnly ? "in-scope " : ""}branches · ${byVendor.size} vendor${byVendor.size === 1 ? "" : "s"}`;

    wireTreeEvents();
    renderTracker();
  }

  function wireTreeEvents() {
    document.querySelectorAll<HTMLElement>("tr.plc2-vendor").forEach((tr) =>
      tr.addEventListener("click", () => { const v = tr.dataset.vendor!; openV.has(v) ? openV.delete(v) : openV.add(v); render(); }));
    document.querySelectorAll<HTMLElement>("tr.plc2-branch").forEach((tr) =>
      tr.addEventListener("click", () => { const b = tr.dataset.branch!; openB.has(b) ? openB.delete(b) : openB.add(b); render(); }));
    document.querySelectorAll<HTMLButtonElement>("button[data-request]").forEach((btn) =>
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const bn = btn.dataset.request!;
        const b = allBranches.find((x: any) => x.branchNo === bn);
        const mgr = b && b.managerName ? `${b.managerName}${b.managerEmail ? " <" + b.managerEmail + ">" : ""}` : "branch manager";
        const rep = b && b.salesRepName ? ` + rep ${b.salesRepName}` : "";
        btn.disabled = true; const orig = btn.textContent; btn.textContent = "Requesting…";
        try {
          const res = await fetch("/api/price-agreement/request-price-list", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ vendorBranchId: b?.vendorBranchId, branchNumber: bn, branchName: b?.branchName, managerName: b?.managerName, managerEmail: b?.managerEmail, salesRepName: b?.salesRepName, coverageStatus: b?.listStatus }),
          });
          const r = await res.json();
          if (r.ok) {
            // Persisted (or already open) — only NOW reflect it in the UI.
            reqOverride[bn] = { requestStatus: "requested", requestedDate: P.today, daysOpen: 0, nextFollowUp: addDays(P.today, 7) };
            toast(r.alreadyOpen ? `Price-list request already open for ${bn}` : `Drafted price-list request for ${bn} → ${mgr}${rep} (FYI Lucinda, Roberto) · awaiting approval`);
            render();
          } else { btn.disabled = false; btn.textContent = orig || "Request Price List"; toast("Request failed: " + (r.error_description || r.error || "error")); }
        } catch { btn.disabled = false; btn.textContent = orig || "Request Price List"; toast("Request failed — network error"); }
      }));
  }

  /* ---- tracker (in-scope branches) ---- */
  function renderTracker() {
    const rows = allBranches.filter((b) => b.inScope).sort((a, b) => {
      const ra = reqOf(a), rb = reqOf(b);
      const rank = (x: any, b: any) => (reqOf(b).requestStatus === "requested" ? 0 : b.listStatus === "none" ? 1 : 2);
      return rank(a, a) - rank(b, b) || (rb.daysOpen || 0) - (ra.daysOpen || 0);
    });
    const body = rows.map((b) => {
      const r = reqOf(b);
      let status: string, requested = "—", days = "—", follow = "—";
      if (r.requestStatus === "requested") {
        status = `<span class="pill pill-new">Requested</span>`;
        requested = r.requestedDate; days = String(r.daysOpen);
        follow = `<span class="${r.nextFollowUp <= P.today ? "due-now" : "due-soon"}">${r.nextFollowUp}${r.nextFollowUp <= P.today ? " · due" : ""}</span>`;
      } else if (b.listStatus === "none") {
        status = `<span class="pill pill-red">Not requested</span>`;
      } else {
        status = `<span class="pill ${b.listCls}">${b.coverageLabel}</span>`;
      }
      return `<tr><td>${b.vendor}</td><td>${b.branchNo}${b.branchName ? " · " + b.branchName : ""}</td><td>${b.office}</td>
        <td>${b.listStatus === "none" ? '<span class="pill pill-red">No list</span>' : `<span class="pill ${b.listCls}">${b.listStatus}</span>`}</td>
        <td>${status}</td><td>${requested}</td><td class="num">${days}</td><td>${follow}</td></tr>`;
    }).join("");
    document.getElementById("plc2-tracker-body")!.innerHTML = body;
    const reqd = rows.filter((b) => reqOf(b).requestStatus === "requested").length;
    const need = rows.filter((b) => b.listStatus === "none" && reqOf(b).requestStatus !== "requested").length;
    document.getElementById("plc2-tracker-sub")!.textContent = `${rows.length} in-scope branches · ${reqd} requested · ${need} need a request · weekly follow-up auto-sends until resolved`;
  }

  function addDays(iso: string, n: number) {
    const parts = iso.split("-").map(Number);
    const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + n));
    return d.toISOString().slice(0, 10);
  }
  let toastTimer: number | undefined;
  function toast(msg: string) {
    let t = document.getElementById("aq-toast");
    if (!t) { t = document.createElement("div"); t.id = "aq-toast"; t.className = "aq-toast"; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("show");
    window.clearTimeout(toastTimer); toastTimer = window.setTimeout(() => t!.classList.remove("show"), 3200);
  }

  /* ---- map-click filtering (office / branch pins on the territory map) ---- */
  document.addEventListener("aq:filter", (e: any) => {
    const { col, val } = e.detail || {};
    if (col === "office") {
      const sel = filtersEl.querySelector<HTMLSelectElement>('select[data-col="office"]')!;
      f.office = f.office === val ? "" : val; sel.value = f.office; render();
    } else if (col === "branchNo") {
      search.value = search.value === val ? "" : val; render();
    }
  });

  render();
}
