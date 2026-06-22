// Shared "progress + checklist" primitive for multi-step surfaces.
//
// The ask: every multi-step task should show the SAME progress bar, let the user check items
// off as they process them, and let them leave and come back without redoing work.
//
// This generalizes the Agreement Builder's Phase-B review bar into a reusable primitive.
// State persists to localStorage (per-browser, zero schema/API) keyed by `storageKey`, so
// "leave and return" works immediately. Surfaces that need durable, cross-device state
// (e.g. the Agreement Builder) keep their DB-backed flag and pass `onChange` to sync.
//
// Markup contract within `root`:
//   - one bar:    <div data-cc-progress>
//                   <span data-cc-progress-txt></span>
//                   <div class="cc-progress-track"><div class="cc-progress-fill" data-cc-progress-fill></div></div>
//                 </div>
//   - N checkboxes: <input type="checkbox" data-cc-check="<unique-id>">

export interface ProgressChecklistController {
  refresh(): void;
  done(): Set<string>;
}

export interface ProgressChecklistOptions {
  root: HTMLElement;
  storageKey: string;
  /** Checkbox selector within root. Default: '[data-cc-check]'. */
  itemSelector?: string;
  /** Progress label text. Default: "<done>/<total> done · <pct>%". */
  label?: (done: number, total: number, pct: number) => string;
  /** Called after each toggle (e.g. to mirror to a DB). Receives the changed id + full done set. */
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

export function initProgressChecklist(opts: ProgressChecklistOptions): ProgressChecklistController {
  const { root, storageKey, onChange } = opts;
  const itemSelector = opts.itemSelector ?? "[data-cc-check]";
  const labelFn = opts.label ?? ((d, t, p) => `${d}/${t} done · ${p}%`);
  const done = readSet(storageKey);

  const boxes = () => [...root.querySelectorAll<HTMLInputElement>(itemSelector)];

  function update() {
    const all = boxes();
    const total = all.length;
    const checked = all.filter((b) => done.has(b.dataset.ccCheck || "")).length;
    const pct = total ? Math.round((checked / total) * 100) : 0;
    const fill = root.querySelector<HTMLElement>("[data-cc-progress-fill]");
    const txt = root.querySelector<HTMLElement>("[data-cc-progress-txt]");
    if (fill) fill.style.width = pct + "%";
    if (txt) txt.textContent = labelFn(checked, total, pct);
  }

  // Reflect persisted state onto the checkboxes, then wire changes.
  for (const b of boxes()) b.checked = done.has(b.dataset.ccCheck || "");
  root.addEventListener("change", (e) => {
    const t = e.target as HTMLElement;
    if (!(t instanceof HTMLInputElement) || !t.matches(itemSelector)) return;
    const id = t.dataset.ccCheck || "";
    if (!id) return;
    if (t.checked) done.add(id);
    else done.delete(id);
    writeSet(storageKey, done);
    update();
    onChange?.(id, t.checked, done);
  });

  update();
  return { refresh: update, done: () => new Set(done) };
}
