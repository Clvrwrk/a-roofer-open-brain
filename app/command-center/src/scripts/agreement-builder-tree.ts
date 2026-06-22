// Agreement Builder — PE Office → Vendor → Vendor/Branch → Category → Item → Variation.
// Office/Vendor/Branch skeleton renders from the overview payload (with cost roll-ups);
// each branch's negotiable catalog loads lazily from /api/price-agreement/branch-detail on
// first expand. Price edits, draft save, handoff, issue-link and exports are per-branch.

interface NegVariation { itemNumber: string; description: string; uom: string; reviewClass: string; spend36mo: number; purchases36mo: number; priorPrice: number | null; priorPriceSource: "agreement" | "invoice_60d" | null; apiPrice: number | null; apiUom: string; proposedPrice: number | null; isOverride: boolean; excluded: boolean; }
interface NegFamily { familyId: string; familyName: string; topClass: string; categoryKey: string; categoryLabel: string; variationCount: number; pricedCount: number; spend36mo: number; variations: NegVariation[]; }
interface AbBranch { branchNumber: string; branchName: string; office: string; vendor: string; paNumber: string; exportId: string; itemCount: number; familyCount: number; pricedCount: number; reviewedCount: number; projectedCost: number; historicalSpend: number; savings: number; hasPackage: boolean; }
interface AbVendor { vendor: string; branchCount: number; projectedCost: number; historicalSpend: number; savings: number; branches: AbBranch[]; }
interface AbOffice { office: string; vendorCount: number; branchCount: number; projectedCost: number; historicalSpend: number; savings: number; vendors: AbVendor[]; }

const root = document.querySelector(".iv") as HTMLElement | null;
const dataEl = document.getElementById("iv-data");
const mount = document.getElementById("iv-tree");

if (root && dataEl && mount) {
  const { offices } = JSON.parse(dataEl.textContent || "{}") as { offices: AbOffice[] };

  const money = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
  const money2 = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const esc = (s: string) => String(s ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c] || c));
  const classPill = (c: string) => (c === "A" ? "pill-brand" : "pill-grey");
  const savingsTag = (n: number) => (Math.abs(n) < 1 ? "" : `<span class="${n >= 0 ? "iv-cost-pos" : "iv-cost-neg"}">${n >= 0 ? "save " : "+"}${money(Math.abs(n))}</span>`);
  const startVal = (v: NegVariation) => (v.proposedPrice != null ? v.proposedPrice : v.priorPrice != null ? v.priorPrice : 0);
  const srcLabel = (s: NegVariation["priorPriceSource"]) => (s === "agreement" ? "agreement" : s === "invoice_60d" ? "invoice &lt;60d" : "none → 0");

  let timer: number | undefined;
  const toastEl = document.getElementById("iv-toast")!;
  const toast = (msg: string) => { toastEl.textContent = msg; toastEl.classList.add("show"); window.clearTimeout(timer); timer = window.setTimeout(() => toastEl.classList.remove("show"), 2600); };

  /* ---------- per-branch detail controller ---------- */
  function renderBranchDetail(body: HTMLElement, br: AbBranch) {
    body.innerHTML = `<p class="iv-loading">Loading negotiable catalog…</p>`;
    fetch(`/api/price-agreement/branch-detail?branch=${encodeURIComponent(br.branchNumber)}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.ok) { body.innerHTML = `<p class="iv-loading">No negotiable detail for this branch.</p>`; return; }
        const families: NegFamily[] = data.families;
        const branch = data.branch as { number: string; name: string; office: string };
        const byItem = new Map<string, NegVariation>();
        families.forEach((f) => f.variations.forEach((v) => byItem.set(v.itemNumber, v)));
        const dirty = new Set<string>();
        const famById = new Map(families.map((f) => [f.familyId, f]));

        // group families by category
        const cats = new Map<string, { label: string; fams: NegFamily[] }>();
        for (const f of families) {
          const c = cats.get(f.categoryKey) ?? { label: f.categoryLabel, fams: [] };
          c.fams.push(f); cats.set(f.categoryKey, c);
        }

        const eid = esc(br.exportId);
        const actions = `
          <div class="iv-actions">
            <span class="iv-actions-id">${eid}</span>
            <a class="iv-export" href="/api/price-agreement/package/pdf?branch=${encodeURIComponent(br.branchNumber)}&name=${encodeURIComponent(br.exportId)}" target="_blank" rel="noopener">📄 PDF</a>
            <a class="iv-export" href="/api/price-agreement/package/csv?branch=${encodeURIComponent(br.branchNumber)}&name=${encodeURIComponent(br.exportId)}">⬇ CSV</a>
            <button type="button" class="iv-export primary" data-act="save" disabled>Save draft</button>
            <button type="button" class="iv-export primary" data-act="handoff">📥 Draft for review</button>
            <button type="button" class="iv-export" data-act="issue">🔗 Issue link</button>
            <a class="iv-export" href="/accounting/price-agreement/methodology" target="_blank" rel="noopener">📘 ABC classes</a>
          </div>`;

        const catList = [...cats.entries()].map(([key, c]) => {
          const fams = c.fams.sort((a, b) => b.spend36mo - a.spend36mo);
          const famHtml = fams.map((f) => famNode(f)).join("");
          const spend = fams.reduce((s, f) => s + f.spend36mo, 0);
          return `
            <details class="iv-cat" data-cat="${esc(key)}">
              <summary><span class="iv-chev" aria-hidden="true">›</span><b>${esc(c.label)}</b>
                <span class="iv-cat-tags"><span class="pill pill-grey">${fams.length} items</span><span class="pill pill-grey">${money(spend)} / 36mo</span></span></summary>
              <div>${famHtml}</div>
            </details>`;
        }).join("");

        body.innerHTML = actions + progressBar(families) + (catList || `<p class="iv-loading">No negotiable items for this branch.</p>`);

        // family bodies lazy-render
        body.querySelectorAll<HTMLDetailsElement>(".iv-fam").forEach((det) => {
          det.addEventListener("toggle", () => {
            if (!det.open) return;
            const fb = det.querySelector(".iv-fam-body") as HTMLElement;
            if (fb.dataset.rendered) return;
            const fam = famById.get(fb.dataset.body!);
            if (!fam) return;
            fb.innerHTML = famBody(fam);
            fb.dataset.rendered = "1";
            bindFamBody(det, fam);
          });
        });
        bindFamSet(body, famById);
        bindFamReview(body, branch, famById, families);
        bindActions(body, branch, families, byItem, dirty);
      })
      .catch(() => { body.innerHTML = `<p class="iv-loading">Failed to load — network error.</p>`; });

    function famNode(fam: NegFamily): string {
      const search = (fam.familyName + " " + fam.variations.map((v) => v.itemNumber + " " + v.description).join(" ")).toLowerCase();
      return `
        <details class="iv-fam" data-fam="${esc(fam.familyId)}" data-search="${esc(search)}">
          <summary>
            <span class="iv-chev" aria-hidden="true">›</span>
            <span><span class="iv-fam-name">${esc(fam.familyName)}</span> <span class="iv-fam-sub">${fam.variationCount} variation${fam.variationCount === 1 ? "" : "s"}</span></span>
            <span class="iv-fam-tags">
              <label class="iv-fam-set">Set all <input class="iv-price-in" type="number" min="0" step="0.01" placeholder="$" data-famset="${esc(fam.familyId)}" /></label>
              <span class="pill ${classPill(fam.topClass)}">Class ${esc(fam.topClass)}</span>
              ${fam.pricedCount ? `<span class="pill pill-green">${fam.pricedCount}/${fam.variationCount} priced</span>` : `<span class="pill pill-yellow">none priced</span>`}
              <span class="pill pill-grey">${money(fam.spend36mo)} / 36mo</span>
              <label class="iv-fam-review" title="Mark this family reviewed/audited"><input type="checkbox" data-famreview="${esc(fam.familyId)}" ${famReviewed(fam) ? "checked" : ""} /> Reviewed</label>
            </span>
          </summary>
          <div class="iv-fam-body" data-body="${esc(fam.familyId)}"></div>
        </details>`;
    }
    function famBody(fam: NegFamily): string {
      const rows = fam.variations.map((v) => `
        <tr class="iv-ln ${v.priorPrice != null ? "has-prior" : "no-prior"}" data-item="${esc(v.itemNumber)}">
          <td class="iv-sku">${esc(v.itemNumber)}</td>
          <td>${esc(v.description)}</td>
          <td><span class="pill ${classPill(v.reviewClass)}">${esc(v.reviewClass)}</span></td>
          <td>${esc(v.uom)}</td>
          <td class="num">${money(v.spend36mo)}</td>
          <td class="num"><span class="iv-prefill ${v.priorPrice == null ? "zero" : ""}">${v.priorPrice == null ? "$0.00" : money2(v.priorPrice)}</span><span class="iv-prefill-src">${srcLabel(v.priorPriceSource)}</span></td>
          <td class="num">${v.apiPrice == null ? '<span class="iv-uom-sfx">—</span>' : money2(v.apiPrice) + ` <span class="iv-uom-sfx">/${esc(v.apiUom || v.uom)}</span>`}</td>
          <td class="num"><input class="iv-price-in" type="number" min="0" step="0.01" inputmode="decimal" value="${startVal(v).toFixed(2)}" data-item="${esc(v.itemNumber)}" data-init="${startVal(v).toFixed(2)}" /><span class="iv-ovr" data-ovr="${esc(v.itemNumber)}" ${v.isOverride ? "" : "hidden"}>override</span></td>
        </tr>`).join("");
      return `<table class="iv-table"><thead><tr><th>Item</th><th>Description</th><th>Class</th><th>UOM</th><th class="num">36mo Spend</th><th class="num">Prior</th><th class="num">API Price</th><th>Proposed</th></tr></thead><tbody>${rows}</tbody></table>`;
    }
    function setSaveEnabled(scope: HTMLElement, on: boolean) {
      const btn = scope.querySelector<HTMLButtonElement>('[data-act="save"]');
      if (btn) { btn.disabled = !on; btn.textContent = on ? "Save draft •" : "Save draft"; }
    }
    // ---- Phase B: review progress ----
    function famReviewed(fam: NegFamily): boolean {
      return fam.variations.length > 0 && fam.variations.every((v) => v.reviewed);
    }
    function progressBar(fams: NegFamily[]): string {
      const total = fams.length;
      const done = fams.filter(famReviewed).length;
      const pct = total ? Math.round((done / total) * 100) : 0;
      return `<div class="iv-progress" data-progress>
        <div class="iv-progress-head"><b>Review progress</b><span data-progress-txt>${done}/${total} families reviewed · ${pct}%</span></div>
        <div class="iv-progress-track"><div class="iv-progress-fill" data-progress-fill style="width:${pct}%"></div></div>
      </div>`;
    }
    function updateProgress(scope: HTMLElement, fams: NegFamily[]) {
      const total = fams.length, done = fams.filter(famReviewed).length;
      const pct = total ? Math.round((done / total) * 100) : 0;
      const fill = scope.querySelector<HTMLElement>("[data-progress-fill]");
      const txt = scope.querySelector<HTMLElement>("[data-progress-txt]");
      if (fill) fill.style.width = pct + "%";
      if (txt) txt.textContent = `${done}/${total} families reviewed · ${pct}%`;
      if (pct === 100 && total > 0) burstConfetti();
    }
    function bindFamReview(scope: HTMLElement, branch: { number: string; name: string; office: string }, fmap: Map<string, NegFamily>, fams: NegFamily[]) {
      scope.querySelectorAll<HTMLInputElement>("[data-famreview]").forEach((cb) => {
        cb.addEventListener("click", (e) => e.stopPropagation());
        cb.addEventListener("change", async (e) => {
          e.stopPropagation();
          const fam = fmap.get(cb.dataset.famreview!); if (!fam) return;
          const on = cb.checked;
          fam.variations.forEach((v) => { v.reviewed = on; });
          updateProgress(scope, fams);
          const payload = fam.variations.map((v) => ({ itemNumber: v.itemNumber, familyId: fam.familyId, familyName: fam.familyName, description: v.description, uom: v.uom, reviewClass: v.reviewClass, priorPrice: v.priorPrice, priorPriceSource: v.priorPriceSource, proposedPrice: v.proposedPrice, isOverride: v.isOverride, excluded: v.excluded, reviewed: v.reviewed }));
          try {
            const res = await fetch("/api/price-agreement/package/items", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ branchNumber: branch.number, branchName: branch.name, office: branch.office, items: payload }) });
            const r = await res.json();
            if (!r.ok) { toast("Review save failed: " + (r.error_description || r.error || "error")); cb.checked = !on; fam.variations.forEach((v) => { v.reviewed = !on; }); updateProgress(scope, fams); return; }
            toast(on ? `Marked “${fam.familyName}” reviewed` : `Unmarked “${fam.familyName}”`);
          } catch { toast("Review save failed — network error."); cb.checked = !on; fam.variations.forEach((v) => { v.reviewed = !on; }); updateProgress(scope, fams); }
        });
      });
    }
    function burstConfetti() {
      const cv = document.getElementById("iv-confetti") as HTMLCanvasElement | null;
      if (!cv) return;
      cv.hidden = false; cv.width = innerWidth; cv.height = innerHeight;
      const ctx = cv.getContext("2d"); if (!ctx) return;
      const colors = ["#2563eb", "#16a34a", "#f59e0b", "#db2777", "#7c3aed"];
      const N = 140, parts = Array.from({ length: N }, (_, i) => ({ x: innerWidth / 2, y: innerHeight / 3, vx: (i / N - 0.5) * 16 + (i % 5 - 2), vy: -Math.abs((i % 9) - 4) * 2 - 6, c: colors[i % colors.length], r: 3 + (i % 4), life: 0 }));
      let frame = 0;
      const tick = () => {
        ctx.clearRect(0, 0, cv.width, cv.height); frame++;
        let alive = false;
        for (const p of parts) { p.vy += 0.35; p.x += p.vx; p.y += p.vy; p.life++; if (p.y < cv.height + 20) { alive = true; ctx.fillStyle = p.c; ctx.fillRect(p.x, p.y, p.r, p.r); } }
        if (alive && frame < 220) requestAnimationFrame(tick); else { cv.hidden = true; ctx.clearRect(0, 0, cv.width, cv.height); }
      };
      requestAnimationFrame(tick);
    }
    function bindFamBody(det: HTMLElement, fam: NegFamily) {
      const fb = det.querySelector(".iv-fam-body") as HTMLElement;
      fb?.querySelectorAll<HTMLInputElement>(".iv-price-in").forEach((inp) => {
        inp.addEventListener("change", () => {
          const v = byItem.get(inp.dataset.item!); if (!v) return;
          const val = inp.value === "" ? null : Math.max(0, Math.round(Number(inp.value) * 100) / 100);
          const changed = inp.value !== inp.dataset.init;
          v.proposedPrice = val; v.isOverride = changed && val != null;
          inp.classList.toggle("dirty", changed);
          const ovr = det.querySelector(`[data-ovr="${CSS.escape(v.itemNumber)}"]`) as HTMLElement | null;
          if (ovr) ovr.hidden = !v.isOverride;
          dirty.add(v.itemNumber); setSaveEnabled(body, true);
        });
      });
    }
    function bindFamSet(scope: HTMLElement, fmap: Map<string, NegFamily>) {
      scope.querySelectorAll<HTMLInputElement>("[data-famset]").forEach((inp) => {
        inp.addEventListener("click", (e) => e.stopPropagation());
        inp.addEventListener("change", (e) => {
          e.stopPropagation();
          const fam = fmap.get(inp.dataset.famset!); if (!fam || inp.value === "") return;
          const val = Math.max(0, Math.round(Number(inp.value) * 100) / 100);
          const det = inp.closest("details.iv-fam") as HTMLElement | null;
          for (const v of fam.variations) {
            if (v.isOverride) continue;
            v.proposedPrice = val; dirty.add(v.itemNumber);
            const cell = det?.querySelector<HTMLInputElement>(`.iv-price-in[data-item="${CSS.escape(v.itemNumber)}"]`);
            if (cell) { cell.value = val.toFixed(2); cell.classList.toggle("dirty", cell.value !== cell.dataset.init); }
          }
          setSaveEnabled(body, true);
        });
      });
    }
    function bindActions(scope: HTMLElement, branch: { number: string; name: string; office: string }, fams: NegFamily[], items: Map<string, NegVariation>, dirtySet: Set<string>) {
      const act = (name: string) => scope.querySelector<HTMLButtonElement>(`[data-act="${name}"]`);
      act("save")?.addEventListener("click", async () => {
        if (dirtySet.size === 0) return;
        const btn = act("save")!; btn.disabled = true;
        const payload = Array.from(dirtySet).map((it) => {
          const v = items.get(it)!; const fam = fams.find((f) => f.variations.includes(v));
          return { itemNumber: v.itemNumber, familyId: fam?.familyId, familyName: fam?.familyName, description: v.description, uom: v.uom, reviewClass: v.reviewClass, priorPrice: v.priorPrice, priorPriceSource: v.priorPriceSource, proposedPrice: v.proposedPrice, isOverride: v.isOverride, excluded: v.excluded, reviewed: v.reviewed };
        });
        try {
          const res = await fetch("/api/price-agreement/package/items", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ branchNumber: branch.number, branchName: branch.name, office: branch.office, items: payload }) });
          const r = await res.json();
          if (!r.ok) { toast("Save failed: " + (r.error_description || r.error || "error")); btn.disabled = false; return; }
          dirtySet.clear();
          scope.querySelectorAll(".iv-price-in.dirty").forEach((el) => { el.classList.remove("dirty"); (el as HTMLInputElement).dataset.init = (el as HTMLInputElement).value; });
          setSaveEnabled(scope, false);
          toast(`Saved ${r.saved} item${r.saved === 1 ? "" : "s"} to draft`);
        } catch { toast("Save failed — network error"); btn.disabled = false; }
      });
      act("handoff")?.addEventListener("click", async () => {
        if (dirtySet.size > 0) { toast("Save your changes first, then prepare the draft."); return; }
        const btn = act("handoff")!; btn.disabled = true;
        try {
          const res = await fetch("/api/price-agreement/package/handoff", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ branchNumber: branch.number }) });
          const r = await res.json();
          toast(r.ok ? (r.alreadyOpen ? "A review draft already exists for this branch." : "Draft created for internal review — nothing sent.") : "Draft failed: " + (r.error_description || r.error || "error"));
        } catch { toast("Draft failed — network error"); }
        btn.disabled = false;
      });
      act("issue")?.addEventListener("click", async () => {
        if (dirtySet.size > 0) { toast("Save your changes first, then issue the link."); return; }
        const btn = act("issue")!; btn.disabled = true;
        try {
          const res = await fetch("/api/price-agreement/package/issue-link", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ branchNumber: branch.number }) });
          const r = await res.json();
          if (!r.ok) { toast("Issue failed: " + (r.error_description || r.error || "error")); btn.disabled = false; return; }
          try { await navigator.clipboard.writeText(r.url); } catch {}
          window.prompt("Magic link copied — send it to the account manager yourself (the agent does not email it). Expires " + new Date(r.expiresAt).toLocaleString() + ":", r.url);
          toast(r.reused ? "Existing link reused + copied." : "Link issued + copied.");
        } catch { toast("Issue failed — network error"); }
        btn.disabled = false;
      });
    }
  }

  /* ---------- skeleton: Office → Vendor → Branch ---------- */
  function branchNode(br: AbBranch): string {
    return `
      <details class="iv-branch" data-branch="${esc(br.branchNumber)}" data-search="${esc((br.branchName + " " + br.branchNumber + " " + br.exportId).toLowerCase())}">
        <summary>
          <span class="iv-chev" aria-hidden="true">›</span>
          <span><span class="iv-branch-name">${esc(br.branchName)}</span> <span class="iv-branch-id">#${esc(br.branchNumber)} · ${esc(br.exportId)}</span></span>
          <span class="iv-branch-tags">
            ${br.hasPackage ? '<span class="pill pill-brand">draft</span>' : ""}
            <span class="pill pill-grey">${br.familyCount} items</span>
            <span class="pill pill-grey">${money(br.projectedCost)} / 36mo</span>
            ${savingsTag(br.savings)}
          </span>
        </summary>
        <div class="iv-branch-body" data-branch-body="${esc(br.branchNumber)}"></div>
      </details>`;
  }
  function vendorNode(v: AbVendor): string {
    return `
      <details class="iv-vendor" data-vendor="${esc(v.vendor)}">
        <summary>
          <span class="iv-chev" aria-hidden="true">›</span>
          <span class="iv-vendor-name">${esc(v.vendor)}</span>
          <span class="iv-branch-tags"><span class="pill pill-grey">${v.branchCount} branches</span><span class="pill pill-grey">${money(v.projectedCost)} / 36mo</span>${savingsTag(v.savings)}</span>
        </summary>
        <div class="iv-vendor-body">${v.branches.map(branchNode).join("")}</div>
      </details>`;
  }
  function officeNode(o: AbOffice): string {
    return `
      <details class="iv-office" data-office="${esc(o.office)}">
        <summary>
          <span class="iv-chev" aria-hidden="true">›</span>
          <span class="iv-office-name">${esc(o.office)}</span>
          <span class="iv-mini">
            <div><strong>${o.branchCount}</strong><span>Branches</span></div>
            <div><strong>${money(o.historicalSpend)}</strong><span>36mo Spend</span></div>
            <div><strong>${money(o.projectedCost)}</strong><span>Projected</span></div>
            <div><strong>${money(o.savings)}</strong><span>Savings</span></div>
          </span>
        </summary>
        <div class="iv-office-body">${o.vendors.map(vendorNode).join("")}</div>
      </details>`;
  }

  mount.innerHTML = offices.map(officeNode).join("") || `<p class="iv-empty">No negotiable items found.</p>`;

  const branchByNumber = new Map<string, AbBranch>();
  offices.forEach((o) => o.vendors.forEach((v) => v.branches.forEach((b) => branchByNumber.set(b.branchNumber, b))));
  mount.querySelectorAll<HTMLDetailsElement>(".iv-branch").forEach((det) => {
    det.addEventListener("toggle", () => {
      if (!det.open) return;
      const body = det.querySelector(".iv-branch-body") as HTMLElement;
      if (body.dataset.rendered) return;
      const br = branchByNumber.get(body.dataset.branchBody!);
      if (!br) return;
      body.dataset.rendered = "1";
      renderBranchDetail(body, br);
    });
  });

  /* ---------- filters ---------- */
  const search = document.getElementById("iv-search") as HTMLInputElement;
  const officeSel = document.getElementById("iv-office") as HTMLSelectElement;
  function applyFilter() {
    const q = search.value.trim().toLowerCase();
    const off = officeSel.value;
    mount.querySelectorAll<HTMLElement>(".iv-office").forEach((oEl) => {
      const officeOk = !off || oEl.dataset.office === off;
      let officeHas = false;
      oEl.querySelectorAll<HTMLElement>(".iv-branch").forEach((bEl) => {
        const qOk = !q || (bEl.dataset.search || "").includes(q);
        bEl.style.display = officeOk && qOk ? "" : "none";
        if (officeOk && qOk) officeHas = true;
      });
      oEl.querySelectorAll<HTMLElement>(".iv-vendor").forEach((vEl) => {
        const any = [...vEl.querySelectorAll<HTMLElement>(".iv-branch")].some((b) => b.style.display !== "none");
        vEl.style.display = any ? "" : "none";
      });
      oEl.style.display = officeHas ? "" : "none";
    });
  }
  [search, officeSel].forEach((el) => el?.addEventListener("input", applyFilter));
  applyFilter();

  /* ---------- deep link: ?branch=XXX (from the Price Agreement Audit "Build agreement →") ---------- */
  (() => {
    const wantBranch = new URLSearchParams(location.search).get("branch");
    if (!wantBranch) return;
    const det = mount.querySelector<HTMLDetailsElement>(`.iv-branch[data-branch="${CSS.escape(wantBranch)}"]`);
    if (!det) return;
    // Isolate the branch via the existing filter, then open its office/vendor ancestors + the branch.
    if (search) { search.value = wantBranch; applyFilter(); }
    let node: HTMLElement | null = det;
    while (node) { if (node instanceof HTMLDetailsElement) node.open = true; node = node.parentElement; }
    det.dispatchEvent(new Event("toggle")); // fires the lazy-render listener for the branch body
    requestAnimationFrame(() => det.scrollIntoView({ behavior: "smooth", block: "start" }));
  })();

  /* ---------- theme ---------- */
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
