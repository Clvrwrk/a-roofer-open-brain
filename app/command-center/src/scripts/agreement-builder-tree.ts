// Price Agreement Builder — top-level family → variation drill-down (read-only).
// Renders the negotiable A+B set grouped by family; each variation prefilled with
// this branch's latest negotiated price (or 0). Branch picker reloads via ?branch=.

interface NegVariation { itemNumber: string; description: string; uom: string; reviewClass: string; spend36mo: number; purchases36mo: number; priorPrice: number | null; }
interface NegFamily { familyId: string; familyName: string; topClass: string; variationCount: number; pricedCount: number; spend36mo: number; variations: NegVariation[]; }

const root = document.querySelector(".iv") as HTMLElement | null;
const dataEl = document.getElementById("iv-data");
const mount = document.getElementById("iv-tree");

if (root && dataEl && mount) {
  const { families } = JSON.parse(dataEl.textContent || "{}") as { families: NegFamily[] };

  const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
  const money2 = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const esc = (s: string) => String(s ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c] || c));
  const classPill = (c: string) => (c === "A" ? "pill-brand" : "pill-grey");

  /* ---- variation table (lazy) ---- */
  function familyBody(fam: NegFamily): string {
    const rows = fam.variations.map((v) => {
      const hasPrior = v.priorPrice != null;
      const prefill = hasPrior
        ? `<span class="iv-prefill">${money2(v.priorPrice as number)}</span>`
        : `<span class="iv-prefill zero">$0.00</span>`;
      return `
      <tr class="iv-ln ${hasPrior ? "has-prior" : "no-prior"}">
        <td class="iv-sku">${esc(v.itemNumber)}</td>
        <td>${esc(v.description)}</td>
        <td><span class="pill ${classPill(v.reviewClass)}">${esc(v.reviewClass)}</span></td>
        <td>${esc(v.uom)}</td>
        <td class="num">${v.purchases36mo}</td>
        <td class="num">${money(v.spend36mo)}</td>
        <td class="num">${prefill}</td>
      </tr>`;
    }).join("");
    return `
      <table class="iv-table">
        <thead><tr><th>Item</th><th>Description</th><th>Class</th><th>UOM</th><th class="num">36mo Qty</th><th class="num">36mo Spend</th><th class="num">Prefill Price</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  function familyNode(fam: NegFamily): string {
    const search = (fam.familyName + " " + fam.familyId + " " + fam.variations.map((v) => v.itemNumber + " " + v.description).join(" ")).toLowerCase();
    return `
      <details class="iv-fam" data-search="${esc(search)}" data-priced="${fam.pricedCount}" data-noprice="${fam.variationCount - fam.pricedCount}">
        <summary>
          <span class="iv-chev" aria-hidden="true">›</span>
          <span><span class="iv-fam-name">${esc(fam.familyName)}</span> <span class="iv-fam-sub">${fam.variationCount} variation${fam.variationCount === 1 ? "" : "s"}</span></span>
          <span class="iv-fam-tags">
            <span class="pill ${classPill(fam.topClass)}">Class ${esc(fam.topClass)}</span>
            ${fam.pricedCount ? `<span class="pill pill-green">${fam.pricedCount}/${fam.variationCount} priced</span>` : `<span class="pill pill-yellow">none priced</span>`}
            <span class="pill pill-grey">${money(fam.spend36mo)} / 36mo</span>
          </span>
        </summary>
        <div class="iv-fam-body" data-fam="${esc(fam.familyId)}"></div>
      </details>`;
  }

  mount.innerHTML = families.map(familyNode).join("");

  // Lazy-render family bodies on first expand.
  const byId = new Map<string, NegFamily>();
  families.forEach((f) => byId.set(f.familyId, f));
  mount.querySelectorAll<HTMLDetailsElement>(".iv-fam").forEach((det) => {
    det.addEventListener("toggle", () => {
      if (!det.open) return;
      const body = det.querySelector(".iv-fam-body") as HTMLElement;
      if (body.dataset.rendered) return;
      const fam = byId.get(body.dataset.fam!);
      if (!fam) return;
      body.innerHTML = familyBody(fam);
      body.dataset.rendered = "1";
    });
  });

  /* ---- filters ---- */
  const search = document.getElementById("iv-search") as HTMLInputElement;
  const covSel = document.getElementById("iv-cov") as HTMLSelectElement;
  function applyFilter() {
    const q = search.value.trim().toLowerCase();
    const cov = covSel.value;
    root!.classList.toggle("iv-priced-only", cov === "priced");
    root!.classList.toggle("iv-noprice-only", cov === "noprice");
    mount.querySelectorAll<HTMLElement>(".iv-fam").forEach((fEl) => {
      const priced = parseInt(fEl.dataset.priced || "0", 10);
      const noprice = parseInt(fEl.dataset.noprice || "0", 10);
      const covOk = cov === "priced" ? priced > 0 : cov === "noprice" ? noprice > 0 : true;
      const qOk = !q || (fEl.dataset.search || "").includes(q);
      fEl.style.display = covOk && qOk ? "" : "none";
    });
  }
  [search, covSel].forEach((el) => el?.addEventListener("input", applyFilter));
  applyFilter();

  /* ---- branch picker reloads the page ---- */
  const branchSel = document.getElementById("iv-branch") as HTMLSelectElement;
  branchSel?.addEventListener("change", () => {
    const url = new URL(window.location.href);
    url.searchParams.set("branch", branchSel.value);
    window.location.href = url.toString();
  });

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
