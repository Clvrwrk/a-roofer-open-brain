/* Generic worklist renderer for the Invoice-Audit KPI drill-downs.
   Reads a JSON payload from #aq-data and renders KPI cards, filters,
   a sortable/filterable table, and a System/Light/Dark theme toggle.
   All six drill-down pages share this one script. */

type Col = {
  key: string;
  label: string;
  align?: "num";
  sort?: boolean;
  render?: "text" | "mono" | "money" | "moneyShort" | "pct" | "pill" | "pillPct" | "pillMoney" | "num" | "days" | "daysDecimal" | "action";
  clsKey?: string;
  subKey?: string;
  hrefKey?: string;
  toneKey?: string;
};
type Filter = { id: string; label: string; col: string; options: { value: string; label: string }[] };
type Kpi = { lab: string; val: string; go?: string; filterCol?: string; filterVal?: string; href?: string };
type Payload = {
  searchKeys: string[];
  filters: Filter[];
  kpis: Kpi[];
  columns: Col[];
  rows: Record<string, any>[];
  countNoun: string;
  defaultSort?: { key: string; dir: number };
  themeKey?: string;
  years?: number[];
};

const dataEl = document.getElementById("aq-data");
const root = document.getElementById("aq") as HTMLElement | null;
if (dataEl && root) {
  const P: Payload = JSON.parse(dataEl.textContent || "{}");
  const money = (n: number) => "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const moneyShort = (n: number) => (n >= 1000 ? "$" + (n / 1000).toFixed(1) + "k" : "$" + Number(n).toFixed(0));
  const pct = (n: number) => (n >= 0 ? "+" : "") + Number(n).toFixed(1) + "%";

  /* ---------- theme toggle ---------- */
  const themeKey = P.themeKey || "auditQueueTheme";
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  function applyTheme(pref: string) {
    const eff = pref === "system" ? (mq.matches ? "dark" : "light") : pref;
    root!.dataset.theme = eff;
    root!.dataset.pref = pref;
    root!.querySelectorAll<HTMLButtonElement>(".theme button").forEach((b) => b.classList.toggle("is-active", b.dataset.setTheme === pref));
  }
  let pref = "system";
  try { pref = localStorage.getItem(themeKey) || "system"; } catch (e) {}
  applyTheme(pref);
  root.querySelectorAll<HTMLButtonElement>(".theme button").forEach((b) =>
    b.addEventListener("click", () => { const p = b.dataset.setTheme!; try { localStorage.setItem(themeKey, p); } catch (e) {} applyTheme(p); })
  );
  mq.addEventListener("change", () => { if (root!.dataset.pref === "system") applyTheme("system"); });

  /* ---------- KPI drill cards ---------- */
  const kpisEl = document.getElementById("aq-kpis")!;
  kpisEl.innerHTML = P.kpis
    .map((k, i) => {
      // Navigation cards carry their filter to the destination so it lands pre-filtered.
      const href = k.href
        ? (k.filterCol ? `${k.href}${k.href.includes("?") ? "&" : "?"}filterCol=${encodeURIComponent(k.filterCol)}&filterVal=${encodeURIComponent(k.filterVal || "")}` : k.href)
        : "#";
      return `<a class="aq-kpi" href="${href}" data-i="${i}"><span class="lab">${k.lab}</span><span class="val">${k.val}</span>${k.go ? `<span class="go">${k.go}</span>` : ""}</a>`;
    })
    .join("");

  /* ---------- filter selects ---------- */
  const filtersEl = document.getElementById("aq-filters")!;
  filtersEl.innerHTML = P.filters
    .map((f) => `<select class="aq-select" data-col="${f.col}"><option value="">${f.label}</option>${f.options.map((o) => `<option value="${o.value}">${o.label}</option>`).join("")}</select>`)
    .join("");
  const selects = Array.from(filtersEl.querySelectorAll<HTMLSelectElement>("select"));

  /* ---------- header ---------- */
  let sortKey = P.defaultSort?.key || P.columns[0].key;
  let sortDir = P.defaultSort?.dir ?? 1;
  const headEl = document.getElementById("aq-head")!;
  headEl.innerHTML = `<tr>${P.columns
    .map((c) => `<th class="${c.align === "num" ? "num " : ""}${c.sort === false ? "no-sort" : ""}" data-sort="${c.sort === false ? "" : c.key}">${c.label}</th>`)
    .join("")}</tr>`;

  const search = document.getElementById("aq-search") as HTMLInputElement;
  const body = document.getElementById("aq-body")!;
  const countEl = document.getElementById("aq-count")!;
  const emptyEl = document.getElementById("aq-empty")!;

  /* ---------- optional Year filter (FY pill + year select) ---------- */
  let year: number | null = P.years && P.years.length ? Math.max(...P.years) : null;
  let fyPill: HTMLElement | null = null;
  if (year != null) {
    fyPill = document.createElement("span");
    fyPill.className = "fy-pill";
    fyPill.textContent = "FY " + year;
    search.parentElement!.insertBefore(fyPill, search);
    const ysel = document.createElement("select");
    ysel.className = "aq-select";
    ysel.setAttribute("aria-label", "Fiscal year");
    P.years!.slice().sort((a, b) => b - a).forEach((y) => ysel.add(new Option("FY " + y, String(y))));
    ysel.value = String(year);
    filtersEl.insertBefore(ysel, filtersEl.firstChild);
    ysel.addEventListener("input", () => { year = Number(ysel.value); fyPill!.textContent = "FY " + year; render(); });
  }

  function cell(col: Col, row: Record<string, any>) {
    const v = row[col.key];
    switch (col.render) {
      case "mono": return `<span class="aq-mono">${v ?? ""}</span>`;
      case "money": return v != null ? money(v) : "—";
      case "moneyShort": return v != null ? moneyShort(v) : "—";
      case "pct": return v != null ? pct(v) : "—";
      case "num": return v ?? "—";
      case "days": return `<span class="${col.toneKey ? row[col.toneKey] : ""}">${v ?? 0}d</span>`;
      case "daysDecimal": return `<span class="${col.toneKey ? row[col.toneKey] : ""}">${Number(v).toFixed(1)}d</span>`;
      case "pillPct": return v != null ? `<span class="pill ${row[col.clsKey!] || "pill-grey"}">${Number(v).toFixed(1)}%</span>` : "—";
      case "pill": return v ? `<span class="pill ${row[col.clsKey!] || "pill-grey"}">${v}</span>` : "—";
      case "pillMoney": return v ? `<span class="pill ${row[col.clsKey!] || "pill-grey"}">${money(v)}</span>` : "—";
      case "action": return `<a class="btn btn-primary btn-small" href="${row[col.hrefKey || "auditHref"]}">Open audit →</a>`;
      default: {
        const tone = col.toneKey ? ` ${row[col.toneKey]}` : "";
        let s = `<span class="${tone.trim()}">${v ?? ""}</span>`;
        if (col.subKey && row[col.subKey] != null) s += `<span class="aq-sub">${row[col.subKey]}</span>`;
        return s;
      }
    }
  }

  function render() {
    const q = search.value.trim().toLowerCase();
    const active: Record<string, string> = {};
    selects.forEach((s) => { if (s.value) active[s.dataset.col!] = s.value; });

    const yearRows = year != null ? P.rows.filter((r) => r.year === year) : P.rows;
    let rows = yearRows.filter((r) => {
      if (q) {
        const hay = P.searchKeys.map((k) => r[k]).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      for (const col in active) if (String(r[col]) !== active[col]) return false;
      return true;
    });

    rows.sort((a, b) => {
      let x = a[sortKey], y = b[sortKey];
      if (typeof x === "string") { x = x.toLowerCase(); y = String(y).toLowerCase(); }
      return x < y ? -sortDir : x > y ? sortDir : 0;
    });

    body.innerHTML = rows
      .map((r) => `<tr>${P.columns.map((c) => `<td class="${c.align === "num" ? "num" : ""}">${cell(c, r)}</td>`).join("")}</tr>`)
      .join("");
    countEl.textContent = `${rows.length} of ${yearRows.length} ${P.countNoun}`;
    emptyEl.hidden = rows.length !== 0;

    headEl.querySelectorAll<HTMLElement>("th[data-sort]").forEach((th) => {
      const k = th.dataset.sort;
      th.classList.toggle("active-sort", !!k && k === sortKey);
      const old = th.querySelector(".ind"); if (old) old.remove();
      if (k && k === sortKey) th.insertAdjacentHTML("beforeend", `<span class="ind">${sortDir > 0 ? "▲" : "▼"}</span>`);
    });
  }

  /* numeric columns default to descending on first click */
  const numericKeys = new Set(P.columns.filter((c) => c.align === "num").map((c) => c.key));
  headEl.querySelectorAll<HTMLElement>("th[data-sort]").forEach((th) =>
    th.addEventListener("click", () => {
      const k = th.dataset.sort; if (!k) return;
      if (sortKey === k) sortDir *= -1; else { sortKey = k; sortDir = numericKeys.has(k) ? -1 : 1; }
      render();
    })
  );
  search.addEventListener("input", render);
  selects.forEach((s) => s.addEventListener("input", render));

  kpisEl.querySelectorAll<HTMLElement>(".aq-kpi").forEach((card, i) =>
    card.addEventListener("click", (e) => {
      const k = P.kpis[i];
      if (k.href) return; // navigation card (e.g. the Negotiated Item Catalog) — let the link work
      e.preventDefault();
      kpisEl.querySelectorAll(".aq-kpi").forEach((c) => c.classList.remove("is-active"));
      card.classList.add("is-active");
      selects.forEach((s) => { if (k.filterCol && s.dataset.col === k.filterCol) s.value = k.filterVal || ""; else if (!k.filterCol) s.value = ""; });
      render();
    })
  );

  /* external filtering — e.g. clicking the vendor territory map dispatches aq:filter */
  document.addEventListener("aq:filter", (e: any) => {
    const { col, val } = e.detail || {};
    const sel = selects.find((s) => s.dataset.col === col);
    if (!sel) return;
    sel.value = sel.value === val ? "" : val; // toggle: click same target again to clear
    render();
  });

  /* land pre-filtered when arrived via a KPI drill-down (?filterCol=&filterVal=) */
  const urlParams = new URLSearchParams(window.location.search);
  const fCol = urlParams.get("filterCol");
  if (fCol) {
    const sel = selects.find((s) => s.dataset.col === fCol);
    if (sel) sel.value = urlParams.get("filterVal") || "";
  }

  render();
}
