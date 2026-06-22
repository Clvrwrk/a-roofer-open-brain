// Global Price List (Price List Review hierarchy, P4) — client behavior.
// • Lazy-loads each branch's current negotiated price list + archived agreement history on expand
//   (/api/price-list-review/branch), so the 15.4k branch-item rows never ship up front.
// • Wires the shared progress-checklist primitive over the per-office "reviewed" checkboxes.
// • Search filters global-price-list rows and branches; offices/branches with no match collapse.
// One-UOM rule: the UOM column carries the unit, so price cells render plain $x.xx (no /SQ suffix).

import { initProgressChecklist } from "./progress-checklist";

interface PlItem {
  itemNumber: string; description: string; manufacturer: string; categoryKey: string; uom: string;
  currentPrice: number | null; currentActive: boolean; currentAgreementNumber: string;
  currentEffective: string; currentExpiry: string;
  priorPrice: number | null; priorAgreementNumber: string; priorEffective: string;
  priceDelta: number | null; priceDeltaPct: number | null;
}
interface PlAgreement {
  agreementId: number; agreementNumber: string; versionLabel: string; effective: string; expiry: string;
  active: boolean; stalenessStatus: string; itemCount: number; recencyRank: number; isCurrent: boolean;
}

const root = document.getElementById("plr");

if (root) {
  const money = (n: number | null) => (n == null ? "—" : "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const esc = (s: string) => String(s ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c] || c));
  const dt = (s: string) => s || "—";

  // ── Progress over offices ──────────────────────────────────────────────────
  initProgressChecklist({
    root,
    storageKey: "plr:offices-reviewed:v1",
    label: (d, t, p) => `${d}/${t} offices reviewed · ${p}%`,
  });

  // ── Lazy branch detail ──────────────────────────────────────────────────────
  function deltaCell(it: PlItem): string {
    if (it.priorPrice == null || it.priceDeltaPct == null) return '<span class="plr-flat">—</span>';
    const cls = it.priceDeltaPct > 0 ? "plr-up" : it.priceDeltaPct < 0 ? "plr-down" : "plr-flat";
    const sign = it.priceDeltaPct > 0 ? "+" : "";
    return `<span class="${cls}">${sign}${it.priceDeltaPct.toFixed(1)}%</span>`;
  }

  function renderBranch(items: PlItem[], agreements: PlAgreement[]): string {
    const current = agreements.find((a) => a.isCurrent);
    const archived = agreements.filter((a) => !a.isCurrent);

    const itemRows = items.length
      ? items.map((it) => `
        <tr>
          <td class="mono">${esc(it.itemNumber)}</td>
          <td>${esc(it.description)}</td>
          <td>${esc(it.uom)}</td>
          <td class="num">${money(it.currentPrice)}</td>
          <td class="num">${money(it.priorPrice)}</td>
          <td class="num">${deltaCell(it)}</td>
        </tr>`).join("")
      : `<tr><td colspan="6" class="plr-empty sm">No negotiated items for this branch.</td></tr>`;

    const itemsTable = `
      <h4 class="plr-h3">Current Negotiated Price List ${current ? `<span class="plr-note">${current.active ? "active" : "expired"} · ${esc(dt(current.effective))} → ${esc(dt(current.expiry))}</span>` : ""}</h4>
      <table class="plr-table">
        <thead><tr><th>Item</th><th>Description</th><th>UOM</th><th class="num">Current</th><th class="num">Prior</th><th class="num">Δ vs prior</th></tr></thead>
        <tbody>${itemRows}</tbody>
      </table>`;

    const archivedBlock = `
      <h4 class="plr-h3" style="margin-top:14px">Archived Agreements <span class="plr-note">newest → oldest</span></h4>
      ${archived.length
        ? `<div class="plr-ag-list">${archived.map((a) => `
            <div class="plr-ag bad">
              <b>Agreement ${esc(a.agreementNumber || "#" + a.agreementId)}</b>
              <span>${esc(dt(a.effective))} → ${esc(dt(a.expiry))} · ${a.itemCount} items${a.versionLabel ? " · " + esc(a.versionLabel) : ""}</span>
            </div>`).join("")}</div>`
        : `<p class="plr-empty sm">No archived agreements yet — this branch has a single agreement generation on file. Prior prices populate automatically when the next agreement is loaded.</p>`}`;

    return itemsTable + archivedBlock;
  }

  const loadBranch = async (det: HTMLDetailsElement) => {
    const body = det.querySelector<HTMLElement>(".plr-branch-body");
    if (!body || body.dataset.loaded === "1") return;
    body.dataset.loaded = "1";
    const branch = det.dataset.branch || "";
    try {
      const res = await fetch(`/api/price-list-review/branch?branch=${encodeURIComponent(branch)}`);
      const r = await res.json();
      if (!res.ok || !r.ok) throw new Error(r.error_description || r.error || "load failed");
      body.innerHTML = renderBranch(r.items || [], r.agreements || []);
    } catch (e) {
      body.dataset.loaded = "0";
      body.innerHTML = `<p class="plr-empty sm">Couldn't load this branch (${esc(String((e as Error).message))}). Collapse and retry.</p>`;
    }
  };

  for (const det of Array.from(document.querySelectorAll<HTMLDetailsElement>(".plr-branch"))) {
    det.addEventListener("toggle", () => { if (det.open) loadBranch(det); });
  }

  // ── Search ──────────────────────────────────────────────────────────────────
  const search = document.getElementById("plr-search") as HTMLInputElement | null;
  const offices = Array.from(document.querySelectorAll<HTMLDetailsElement>(".plr-office"));
  search?.addEventListener("input", () => {
    const q = search.value.trim().toLowerCase();
    for (const office of offices) {
      let anyOffice = false;
      // global price list rows
      for (const row of Array.from(office.querySelectorAll<HTMLElement>(".plr-global tbody tr"))) {
        const hit = !q || (row.getAttribute("data-search") || "").includes(q);
        row.style.display = hit ? "" : "none";
        anyOffice = anyOffice || hit;
      }
      // branches
      for (const br of Array.from(office.querySelectorAll<HTMLElement>(".plr-branch"))) {
        const hit = !q || (br.getAttribute("data-search") || "").includes(q);
        br.style.display = hit ? "" : "none";
        anyOffice = anyOffice || hit;
      }
      office.style.display = anyOffice ? "" : "none";
      if (q && anyOffice) office.open = true;
    }
  });
}
