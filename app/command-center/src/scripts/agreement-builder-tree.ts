// Price Agreement Builder — top-level family → variation worksheet (editable).
// Negotiable A+B set grouped by family; each variation prefilled (negotiated →
// recent-invoice <60d → 0). Set a price at the family level to cascade to all
// non-overridden variations; edit a variation to make its price primary (override).
// Edits save as a per-branch DRAFT package — nothing is sent anywhere.

interface NegVariation { itemNumber: string; description: string; uom: string; reviewClass: string; spend36mo: number; purchases36mo: number; priorPrice: number | null; priorPriceSource: "agreement" | "invoice_60d" | null; proposedPrice: number | null; isOverride: boolean; excluded: boolean; }
interface NegFamily { familyId: string; familyName: string; topClass: string; variationCount: number; pricedCount: number; spend36mo: number; variations: NegVariation[]; }
interface Branch { number: string; name: string; office: string; }

const root = document.querySelector(".iv") as HTMLElement | null;
const dataEl = document.getElementById("iv-data");
const mount = document.getElementById("iv-tree");

if (root && dataEl && mount) {
  const parsed = JSON.parse(dataEl.textContent || "{}") as { families: NegFamily[]; branch: Branch | null; packageId: string | null };
  const families = parsed.families;
  const branch = parsed.branch;

  const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
  const money2 = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const esc = (s: string) => String(s ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c] || c));
  const classPill = (c: string) => (c === "A" ? "pill-brand" : "pill-grey");
  // The value shown in a variation's price input: explicit proposal → prior price → 0.
  const startVal = (v: NegVariation) => (v.proposedPrice != null ? v.proposedPrice : v.priorPrice != null ? v.priorPrice : 0);

  const byItem = new Map<string, NegVariation>();
  families.forEach((f) => f.variations.forEach((v) => byItem.set(v.itemNumber, v)));
  const dirty = new Set<string>();

  /* ---- save bar ---- */
  const saveBar = document.getElementById("iv-savebar") as HTMLElement;
  const saveMsg = document.getElementById("iv-savebar-msg") as HTMLElement;
  const saveBtn = document.getElementById("iv-save") as HTMLButtonElement;
  const proposedKpi = document.getElementById("iv-proposed");
  function refreshSaveBar() {
    if (dirty.size === 0) { saveBar.hidden = true; return; }
    saveBar.hidden = false;
    saveMsg.textContent = `${dirty.size} unsaved change${dirty.size === 1 ? "" : "s"}`;
    saveBtn.disabled = false;
  }
  function markDirty(item: string) { dirty.add(item); refreshSaveBar(); if (proposedKpi) proposedKpi.textContent = String(families.reduce((s, f) => s + f.variations.filter((v) => v.proposedPrice != null).length, 0)); }

  /* ---- variation rows (lazy) ---- */
  const srcLabel = (s: NegVariation["priorPriceSource"]) => (s === "agreement" ? "agreement" : s === "invoice_60d" ? "invoice &lt;60d" : "none → 0");
  function familyBody(fam: NegFamily): string {
    const rows = fam.variations.map((v) => `
      <tr class="iv-ln ${v.priorPrice != null ? "has-prior" : "no-prior"}" data-item="${esc(v.itemNumber)}">
        <td class="iv-sku">${esc(v.itemNumber)}</td>
        <td>${esc(v.description)}</td>
        <td><span class="pill ${classPill(v.reviewClass)}">${esc(v.reviewClass)}</span></td>
        <td>${esc(v.uom)}</td>
        <td class="num">${money(v.spend36mo)}</td>
        <td class="num"><span class="iv-prefill ${v.priorPrice == null ? "zero" : ""}">${v.priorPrice == null ? "$0.00" : money2(v.priorPrice)}</span><span class="iv-prefill-src">${srcLabel(v.priorPriceSource)}</span></td>
        <td class="num"><input class="iv-price-in" type="number" min="0" step="0.01" inputmode="decimal" value="${startVal(v).toFixed(2)}" data-item="${esc(v.itemNumber)}" data-init="${startVal(v).toFixed(2)}" /><span class="iv-ovr" data-ovr="${esc(v.itemNumber)}" ${v.isOverride ? "" : "hidden"}>override</span></td>
      </tr>`).join("");
    return `
      <table class="iv-table">
        <thead><tr><th>Item</th><th>Description</th><th>Class</th><th>UOM</th><th class="num">36mo Spend</th><th class="num">Prior</th><th class="num">Proposed</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  function bindFamilyBody(det: HTMLElement, fam: NegFamily) {
    // Scope to the body so the family-level "Set all" input (in the summary, same
    // class) is not double-bound with the variation handler.
    const body = det.querySelector(".iv-fam-body") as HTMLElement;
    body?.querySelectorAll<HTMLInputElement>(".iv-price-in").forEach((inp) => {
      inp.addEventListener("change", () => {
        const v = byItem.get(inp.dataset.item!);
        if (!v) return;
        const val = inp.value === "" ? null : Math.max(0, Math.round(Number(inp.value) * 100) / 100);
        const changed = inp.value !== inp.dataset.init;
        v.proposedPrice = val;
        // Only a real, non-empty change makes the variation's price primary; a
        // no-op edit or a clear-to-blank must NOT permanently override (else it
        // would be excluded from later family "Set all" cascades).
        v.isOverride = changed && val != null;
        inp.classList.toggle("dirty", changed);
        const ovr = det.querySelector(`[data-ovr="${CSS.escape(v.itemNumber)}"]`) as HTMLElement | null;
        if (ovr) ovr.hidden = !v.isOverride;
        markDirty(v.itemNumber);
      });
    });
  }

  /* ---- family node ---- */
  function familyNode(fam: NegFamily): string {
    const search = (fam.familyName + " " + fam.familyId + " " + fam.variations.map((v) => v.itemNumber + " " + v.description).join(" ")).toLowerCase();
    return `
      <details class="iv-fam" data-fam="${esc(fam.familyId)}" data-search="${esc(search)}" data-priced="${fam.pricedCount}" data-noprice="${fam.variationCount - fam.pricedCount}">
        <summary>
          <span class="iv-chev" aria-hidden="true">›</span>
          <span><span class="iv-fam-name">${esc(fam.familyName)}</span> <span class="iv-fam-sub">${fam.variationCount} variation${fam.variationCount === 1 ? "" : "s"}</span></span>
          <span class="iv-fam-tags">
            <label class="iv-fam-set">Set all <input class="iv-price-in" type="number" min="0" step="0.01" placeholder="$" data-famset="${esc(fam.familyId)}" /></label>
            <span class="pill ${classPill(fam.topClass)}">Class ${esc(fam.topClass)}</span>
            ${fam.pricedCount ? `<span class="pill pill-green">${fam.pricedCount}/${fam.variationCount} priced</span>` : `<span class="pill pill-yellow">none priced</span>`}
            <span class="pill pill-grey">${money(fam.spend36mo)} / 36mo</span>
          </span>
        </summary>
        <div class="iv-fam-body" data-body="${esc(fam.familyId)}"></div>
      </details>`;
  }

  mount.innerHTML = families.map(familyNode).join("");

  const famById = new Map<string, NegFamily>();
  families.forEach((f) => famById.set(f.familyId, f));

  // Lazy-render family bodies on first expand.
  mount.querySelectorAll<HTMLDetailsElement>(".iv-fam").forEach((det) => {
    det.addEventListener("toggle", () => {
      if (!det.open) return;
      const body = det.querySelector(".iv-fam-body") as HTMLElement;
      if (body.dataset.rendered) return;
      const fam = famById.get(body.dataset.body!);
      if (!fam) return;
      body.innerHTML = familyBody(fam);
      body.dataset.rendered = "1";
      bindFamilyBody(det, fam);
    });
  });

  // Family-level "Set all": cascade to every non-overridden variation in the family.
  mount.querySelectorAll<HTMLInputElement>("[data-famset]").forEach((inp) => {
    inp.addEventListener("click", (e) => e.stopPropagation());
    inp.addEventListener("change", (e) => {
      e.stopPropagation();
      const fam = famById.get(inp.dataset.famset!);
      if (!fam || inp.value === "") return;
      const val = Math.max(0, Math.round(Number(inp.value) * 100) / 100);
      const det = inp.closest("details.iv-fam") as HTMLElement | null;
      for (const v of fam.variations) {
        if (v.isOverride) continue; // overrides keep their primary price
        v.proposedPrice = val;
        markDirty(v.itemNumber);
        const cell = det?.querySelector<HTMLInputElement>(`.iv-price-in[data-item="${CSS.escape(v.itemNumber)}"]`);
        if (cell) { cell.value = val.toFixed(2); cell.classList.toggle("dirty", cell.value !== cell.dataset.init); }
      }
    });
  });

  /* ---- save ---- */
  saveBtn?.addEventListener("click", async () => {
    if (!branch || dirty.size === 0) return;
    saveBtn.disabled = true;
    const items = Array.from(dirty).map((it) => {
      const v = byItem.get(it)!;
      const fam = families.find((f) => f.variations.includes(v));
      return { itemNumber: v.itemNumber, familyId: fam?.familyId, familyName: fam?.familyName, description: v.description, uom: v.uom, reviewClass: v.reviewClass, priorPrice: v.priorPrice, priorPriceSource: v.priorPriceSource, proposedPrice: v.proposedPrice, isOverride: v.isOverride, excluded: v.excluded };
    });
    try {
      const res = await fetch("/api/price-agreement/package/items", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ branchNumber: branch.number, branchName: branch.name, office: branch.office, items }),
      });
      const r = await res.json();
      if (!r.ok) { toast("Save failed: " + (r.error_description || r.error || "error")); saveBtn.disabled = false; return; }
      dirty.clear();
      mount.querySelectorAll(".iv-price-in.dirty").forEach((el) => { el.classList.remove("dirty"); (el as HTMLInputElement).dataset.init = (el as HTMLInputElement).value; });
      refreshSaveBar();
      toast(`Saved ${r.saved} item${r.saved === 1 ? "" : "s"} to draft`);
    } catch { toast("Save failed — network error"); saveBtn.disabled = false; }
  });

  /* ---- prepare draft for internal review (NEVER sends externally) ---- */
  const handoffBtn = document.getElementById("iv-handoff") as HTMLButtonElement | null;
  handoffBtn?.addEventListener("click", async () => {
    if (!branch) return;
    if (dirty.size > 0) { toast("Save your changes first, then prepare the draft."); return; }
    handoffBtn.disabled = true;
    try {
      const res = await fetch("/api/price-agreement/package/handoff", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ branchNumber: branch.number }),
      });
      const r = await res.json();
      if (!r.ok) { toast("Draft failed: " + (r.error_description || r.error || "error")); handoffBtn.disabled = false; return; }
      toast(r.alreadyOpen ? "A review draft already exists for this branch." : "Draft created for internal review — nothing sent.");
    } catch { toast("Draft failed — network error"); }
    handoffBtn.disabled = false;
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

  /* ---- branch picker reloads ---- */
  const branchSel = document.getElementById("iv-branch") as HTMLSelectElement;
  branchSel?.addEventListener("change", () => {
    if (dirty.size > 0 && !confirm("Discard unsaved changes and switch branch?")) { return; }
    const url = new URL(window.location.href);
    url.searchParams.set("branch", branchSel.value);
    window.location.href = url.toString();
  });

  /* ---- toast ---- */
  let timer: number | undefined;
  const toastEl = document.getElementById("iv-toast")!;
  function toast(msg: string) { toastEl.textContent = msg; toastEl.classList.add("show"); window.clearTimeout(timer); timer = window.setTimeout(() => toastEl.classList.remove("show"), 2400); }

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
