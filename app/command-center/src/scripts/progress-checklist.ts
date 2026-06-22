// Shared "progress + checklist" primitive for multi-step surfaces — now HIERARCHICAL.
//
// The ask (site-wide): every nested drill-down (PE Office → Branch → … → line) shows a progress
// bar at EVERY nesting level, rolling up from the deepest line to the office. The user checks a
// line off (or a line is already "done" via a DB disposition) and every ancestor bar advances.
//
// A surface picks ONE leaf mode:
//
//   • REVIEW mode (pass `storageKey`): the user checks leaves off; state persists per-browser in
//     localStorage. Leaf paths are slash-delimited and PREFIXED by their scope paths so a scope's
//     progress is correct even before its lazy children mount.
//       leaf:   <input type="checkbox" data-cc-check="<office>/<branch>/<line>">
//       scope:  <details data-cc-scope data-cc-path="<office>/<branch>" data-cc-total="231"> … </details>
//     done(scope) = persisted leaf-paths under scope.path; total = data-cc-total (server-declared,
//     so lazy subtrees still roll up correctly). Without data-cc-total, total = leaves in the DOM.
//
//   • DISPOSITION mode (no `storageKey`): "done" already lives in DB-backed state (e.g. invoice
//     audit_status). Seed each scope from server counts and bump as the user acts — no persistence:
//       scope:  <details data-cc-scope data-cc-total="16" data-cc-done="4"> … </details>
//     then call controller.bumpLeaf(leafEl, +1 | -1) when a leaf flips so ancestor bars update live.
//
// Bar markup inside a scope (and optionally at the root, which is the top scope):
//   <div data-cc-progress>
//     <span data-cc-progress-txt></span>
//     <div class="cc-progress-track"><div class="cc-progress-fill" data-cc-progress-fill></div></div>
//   </div>
// A bar belongs to its closest [data-cc-scope] ancestor (or the root when it has none).

export interface ProgressController {
  /** Recompute + re-render every level (call after lazy content mounts). */
  refresh(): void;
  /** REVIEW mode: the set of checked leaf paths. */
  done(): Set<string>;
  /** DISPOSITION mode: apply +1/-1 for a leaf and roll the delta up every ancestor bar. */
  bumpLeaf(leafEl: HTMLElement, delta: number): void;
}

export interface ProgressTreeOptions {
  root: HTMLElement;
  /** Present → REVIEW (localStorage) mode; absent → DISPOSITION mode. */
  storageKey?: string;
  /** Nesting-scope selector. Default '[data-cc-scope]'. */
  scopeSelector?: string;
  /** Leaf checkbox selector (REVIEW mode). Default '[data-cc-check]'. */
  itemSelector?: string;
  /** Bar label. Default "<done>/<total> · <pct>%". */
  label?: (done: number, total: number, pct: number) => string;
  /** REVIEW mode: called after each toggle (e.g. to mirror to a DB). */
  onChange?: (id: string, checked: boolean, done: Set<string>) => void;
}

function readSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr.map(String) : []);
  } catch {
    return new Set();
  }
}

function writeSet(key: string, set: Set<string>): void {
  try {
    localStorage.setItem(key, JSON.stringify([...set]));
  } catch {
    /* storage full / unavailable — progress simply isn't persisted this session */
  }
}

export function initProgressTree(opts: ProgressTreeOptions): ProgressController {
  const { root } = opts;
  const scopeSel = opts.scopeSelector ?? "[data-cc-scope]";
  const itemSel = opts.itemSelector ?? "[data-cc-check]";
  const labelFn = opts.label ?? ((d, t, p) => `${d}/${t} · ${p}%`);
  const reviewMode = typeof opts.storageKey === "string";
  const store = reviewMode ? readSet(opts.storageKey as string) : new Set<string>();
  // DISPOSITION mode: per-scope live "done" count, seeded lazily from data-cc-done.
  const dispDone = new WeakMap<HTMLElement, number>();

  const scopeEls = (): HTMLElement[] => [root, ...Array.from(root.querySelectorAll<HTMLElement>(scopeSel))];

  function owningScope(el: HTMLElement): HTMLElement {
    const s = el.parentElement?.closest<HTMLElement>(scopeSel) ?? null;
    return s && root.contains(s) ? s : root;
  }

  function barsForScope(scope: HTMLElement): HTMLElement[] {
    const all = Array.from((scope === root ? root : scope).querySelectorAll<HTMLElement>("[data-cc-progress]"));
    return all.filter((bar) => owningScope(bar) === scope);
  }

  function countReview(scope: HTMLElement): { done: number; total: number } {
    const prefix = scope === root ? "" : scope.dataset.ccPath ?? "";
    let done = 0;
    for (const p of store) if (prefix === "" || p === prefix || p.startsWith(prefix + "/")) done++;
    const declared = scope.dataset.ccTotal;
    const total = declared != null ? Number(declared) || 0 : (scope === root ? root : scope).querySelectorAll(itemSel).length;
    return { done: total ? Math.min(done, total) : done, total };
  }

  function countDisp(scope: HTMLElement): { done: number; total: number } {
    const total = Number(scope.dataset.ccTotal ?? "0") || 0;
    let done = dispDone.get(scope);
    if (done == null) {
      done = Number(scope.dataset.ccDone ?? "0") || 0;
      dispDone.set(scope, done);
    }
    return { done: Math.min(done, total || done), total };
  }

  function renderScope(scope: HTMLElement): void {
    const { done, total } = reviewMode ? countReview(scope) : countDisp(scope);
    const pct = total ? Math.round((done / total) * 100) : 0;
    for (const bar of barsForScope(scope)) {
      const fill = bar.querySelector<HTMLElement>("[data-cc-progress-fill]");
      const txt = bar.querySelector<HTMLElement>("[data-cc-progress-txt]");
      if (fill) fill.style.width = pct + "%";
      if (txt) txt.textContent = labelFn(done, total, pct);
      bar.classList.toggle("is-complete", total > 0 && done >= total);
    }
  }

  function syncBoxes(): void {
    if (!reviewMode) return;
    for (const b of Array.from(root.querySelectorAll<HTMLInputElement>(itemSel))) b.checked = store.has(b.dataset.ccCheck || "");
  }

  function refresh(): void {
    syncBoxes();
    for (const s of scopeEls()) renderScope(s);
  }

  if (reviewMode) {
    root.addEventListener("change", (e) => {
      const t = e.target as HTMLElement;
      if (!(t instanceof HTMLInputElement) || !t.matches(itemSel)) return;
      const id = t.dataset.ccCheck || "";
      if (!id) return;
      if (t.checked) store.add(id);
      else store.delete(id);
      writeSet(opts.storageKey as string, store);
      for (const s of scopeEls()) renderScope(s);
      opts.onChange?.(id, t.checked, new Set(store));
    });
  }

  function bumpLeaf(leafEl: HTMLElement, delta: number): void {
    if (reviewMode) return;
    const scopes: HTMLElement[] = [];
    let node: HTMLElement | null = leafEl;
    const seen = new Set<HTMLElement>();
    while (node) {
      const s = node.closest<HTMLElement>(scopeSel);
      if (!s || !root.contains(s)) break;
      if (!seen.has(s)) { seen.add(s); scopes.push(s); }
      node = s.parentElement;
    }
    scopes.push(root);
    for (const s of scopes) {
      dispDone.set(s, Math.max(0, countDisp(s).done + delta));
      renderScope(s);
    }
  }

  refresh();
  return { refresh, done: () => new Set(store), bumpLeaf };
}

// ── Backward-compatible flat checklist (single root scope) ────────────────────
export interface ProgressChecklistController {
  refresh(): void;
  done(): Set<string>;
}
export interface ProgressChecklistOptions {
  root: HTMLElement;
  storageKey: string;
  itemSelector?: string;
  label?: (done: number, total: number, pct: number) => string;
  onChange?: (id: string, checked: boolean, done: Set<string>) => void;
}

/** Flat (non-nested) checklist — kept for callers that just want one bar over one set of boxes. */
export function initProgressChecklist(opts: ProgressChecklistOptions): ProgressChecklistController {
  const c = initProgressTree({ ...opts, scopeSelector: "[data-cc-no-scope]" });
  return { refresh: c.refresh, done: c.done };
}
