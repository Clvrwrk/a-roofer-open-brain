/* Negotiated Item Catalog drill.
   - Year filter (+ FY indicator) and Vendor filter (invoice-audit style).
   - Period toggle (Monthly / Quarterly / Annual) scales spend & qty.
   - By-State / By-PE-Office bars are STACKED and color-segmented by Vendor
     (no vendor selected) or by Vendor Branch (a vendor is selected). */

const dataEl = document.getElementById("plc-data");
const root = document.getElementById("aq") as HTMLElement | null;
if (dataEl && root) {
  const P = JSON.parse(dataEl.textContent || "{}") as {
    rows: any[]; vendors: string[]; states: string[]; offices: string[]; years: number[];
  };

  const money = (n: number) => "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
  const num = (n: number) => Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
  const PALETTE = ["#5b46d8", "#0e9f6e", "#d97706", "#0891b2", "#db2777", "#65a30d", "#2563eb", "#9333ea", "#dc2626", "#0d9488"];
  const OTHER = "#9aa6b4";

  /* theme toggle */
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  function applyTheme(pref: string) {
    const eff = pref === "system" ? (mq.matches ? "dark" : "light") : pref;
    root!.dataset.theme = eff;
    root!.dataset.pref = pref;
    root!.querySelectorAll<HTMLButtonElement>(".theme button").forEach((b) => b.classList.toggle("is-active", b.dataset.setTheme === pref));
  }
  let pref = "system";
  try { pref = localStorage.getItem("aqCatalogTheme") || "system"; } catch (e) {}
  applyTheme(pref);
  root.querySelectorAll<HTMLButtonElement>(".theme button").forEach((b) =>
    b.addEventListener("click", () => { const p = b.dataset.setTheme!; try { localStorage.setItem("aqCatalogTheme", p); } catch (e) {} applyTheme(p); })
  );
  mq.addEventListener("change", () => { if (root!.dataset.pref === "system") applyTheme("system"); });

  /* controls */
  const DIV: Record<string, number> = { Monthly: 12, Quarterly: 4, Annual: 1 };
  let period = "Annual";
  let year = Math.max(...P.years);
  let vendor = "";

  const yearSel = document.getElementById("plc-year") as HTMLSelectElement;
  P.years.slice().sort((a, b) => b - a).forEach((y) => yearSel.add(new Option("FY " + y, String(y))));
  yearSel.value = String(year);
  const vendorSel = document.getElementById("plc-vendor") as HTMLSelectElement;
  P.vendors.forEach((v) => vendorSel.add(new Option(v, v)));
  const search = document.getElementById("plc-search") as HTMLInputElement;
  const fyPill = document.getElementById("plc-fy")!;

  /* group key/label depend on whether a vendor is selected */
  const groupKey = (r: any) => (vendor ? r.branchNo : r.vendor);
  const groupLabel = (r: any) => (vendor ? (r.branchName ? r.branchNo + " · " + r.branchName : r.branchNo) : r.vendor);

  function visible() {
    const q = search.value.trim().toLowerCase();
    return P.rows.filter((r) =>
      r.year === year &&
      (!vendor || r.vendor === vendor) &&
      (!q || [r.sku, r.desc, r.vendor].join(" ").toLowerCase().includes(q))
    );
  }

  function colorMapFor(rows: any[]) {
    const totals: Record<string, { v: number; label: string }> = {};
    rows.forEach((r) => { const k = groupKey(r); (totals[k] ||= { v: 0, label: groupLabel(r) }).v += r.spend; });
    const sorted = Object.entries(totals).sort((a, b) => b[1].v - a[1].v);
    const map: Record<string, string> = {};
    const legend: { label: string; color: string }[] = [];
    sorted.forEach(([k, info], i) => {
      const color = i < PALETTE.length ? PALETTE[i] : OTHER;
      map[k] = color;
      if (i < PALETTE.length) legend.push({ label: info.label, color });
    });
    const hasOther = sorted.length > PALETTE.length;
    if (hasOther) legend.push({ label: "Other", color: OTHER });
    return { map, legend };
  }

  function barPanel(title: string, groupBy: string, metric: string, fmt: (n: number) => string, rows: any[], colorMap: Record<string, string>) {
    const d = DIV[period];
    const buckets: Record<string, { total: number; segs: Record<string, number> }> = {};
    rows.forEach((r) => {
      const b = r[groupBy];
      const bk = (buckets[b] ||= { total: 0, segs: {} });
      const v = r[metric] / d;
      bk.total += v;
      const g = groupKey(r);
      bk.segs[g] = (bk.segs[g] || 0) + v;
    });
    const entries = Object.entries(buckets).sort((a, b) => b[1].total - a[1].total);
    const max = Math.max(...entries.map((e) => e[1].total), 1);
    const body = entries.map(([name, info]) => {
      const segs = Object.entries(info.segs)
        .sort((a, b) => b[1] - a[1])
        .map(([g, v]) => `<span class="plc-seg" style="flex:0 0 ${(v / max) * 100}%;background:${colorMap[g] || OTHER}" title="${g}: ${fmt(v)}"></span>`)
        .join("");
      return `<div class="plc-bar"><span class="lab" title="${name}">${name}</span><span class="track">${segs}</span><span class="n">${fmt(info.total)}</span></div>`;
    }).join("");
    return `<div class="plc-viz"><h3>${title}</h3>${body || '<span class="aq-sub">No data</span>'}</div>`;
  }

  function render() {
    const d = DIV[period];
    const rows = visible();
    const { map, legend } = colorMapFor(rows);

    fyPill.textContent = "FY " + year;

    /* legend */
    document.getElementById("plc-legend")!.innerHTML =
      `<span class="dim">Segments by ${vendor ? "Vendor Branch" : "Vendor"}${vendor ? " (" + vendor + ")" : ""}</span>` +
      legend.map((l) => `<span class="it"><span class="sw" style="background:${l.color}"></span>${l.label}</span>`).join("");

    /* four segmented panels */
    document.getElementById("plc-viz")!.innerHTML =
      barPanel("Revenue by State", "state", "spend", money, rows, map) +
      barPanel("Qty by State", "state", "qty", num, rows, map) +
      barPanel("Revenue by PE Office", "office", "spend", money, rows, map) +
      barPanel("Qty by PE Office", "office", "qty", num, rows, map);

    /* table: aggregate by SKU, top 200 by spend */
    const bySku = new Map<string, any>();
    rows.forEach((r) => {
      let it = bySku.get(r.sku);
      if (!it) { it = { sku: r.sku, desc: r.desc, vendor: r.vendor, spend: 0, qty: 0, neg: 0 }; bySku.set(r.sku, it); }
      it.spend += r.spend; it.qty += r.qty; if (r.covered) it.neg += r.spend;
    });
    const items = Array.from(bySku.values()).sort((a, b) => b.spend - a.spend).slice(0, 200);
    document.getElementById("plc-body")!.innerHTML = items.map((it, i) => {
      const share = Math.round((it.neg / (it.spend || 1)) * 100);
      const cov = share >= 80 ? ["Covered", "pill-green"] : share >= 40 ? ["Partial", "pill-yellow"] : ["Gap", "pill-red"];
      return `<tr>
        <td class="plc-rank">${i + 1}</td>
        <td class="aq-mono">${it.sku}</td>
        <td>${it.desc}</td>
        <td>${it.vendor}</td>
        <td class="num">${money(it.spend / d)}</td>
        <td class="num">${num(it.qty / d)}</td>
        <td><span class="pill ${cov[1]}">${cov[0]} · ${share}%</span></td>
        <td><span class="pill pill-grey">TBD</span></td></tr>`;
    }).join("");

    const totalSpend = items.reduce((s, it) => s + it.spend / d, 0);
    document.getElementById("plc-count")!.textContent = `FY ${year} · ${period} · ${items.length} items · ${money(totalSpend)}`;
  }

  document.querySelectorAll<HTMLButtonElement>(".plc-period button").forEach((b) =>
    b.addEventListener("click", () => {
      period = b.dataset.period!;
      document.querySelectorAll(".plc-period button").forEach((x) => x.classList.toggle("is-active", x === b));
      render();
    })
  );
  yearSel.addEventListener("input", () => { year = Number(yearSel.value); render(); });
  vendorSel.addEventListener("input", () => { vendor = vendorSel.value; render(); });
  search.addEventListener("input", render);
  render();
}
