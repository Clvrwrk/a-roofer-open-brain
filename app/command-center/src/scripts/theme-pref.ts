// Shared light/dark preference for every audit work surface.
//
// Five live surfaces (Invoice Audit, Order Audit, Estimate Audit, Agreement
// Builder, Friday WIP) each shipped their own copy of this toggle, against two
// different localStorage keys — `ivTheme` and `eaTheme`. Choosing dark on
// Invoice Audit and walking to Estimate Audit put you back in light: one
// preference, expressed five times, agreeing with itself only by accident.
//
// The orphaned AuditQueue component carried two more keys (`auditQueueTheme`,
// `aqCreditMemoTheme`); it is unreachable since the 2026-08-19 credit-memo
// rebuild, so it is left untouched here and migrated as legacy keys only.
//
// One key now (`cc.theme`), read through a migration off the legacy keys so a
// preference already on disk survives the change. Each surface keeps its own
// scoped `[data-theme]` CSS and its own control markup — this owns the
// preference, not the chrome. Relocating the control itself into AppShell is a
// layout change and belongs with the toolbar work, not here.

const KEY = "cc.theme";
// Newest first: whichever legacy key the visitor last wrote is the one to adopt.
const LEGACY_KEYS = ["ivTheme", "eaTheme", "aqCreditMemoTheme", "auditQueueTheme"];

export type ThemePref = "system" | "light" | "dark";

const isPref = (v: unknown): v is ThemePref => v === "system" || v === "light" || v === "dark";

/** Read the shared preference, adopting (and forward-writing) a legacy value once. */
export function readThemePref(): ThemePref {
  try {
    const current = localStorage.getItem(KEY);
    if (isPref(current)) return current;
    for (const legacy of LEGACY_KEYS) {
      const v = localStorage.getItem(legacy);
      if (isPref(v)) {
        localStorage.setItem(KEY, v); // migrate forward; leave the old key alone
        return v;
      }
    }
  } catch {
    /* private mode / storage disabled — fall through to the default */
  }
  return "system";
}

export function writeThemePref(pref: ThemePref): void {
  try { localStorage.setItem(KEY, pref); } catch { /* private mode */ }
}

/**
 * Wire a surface's theme trio to the shared preference.
 *
 * `root` carries the scoped `data-theme` / `data-pref` the surface's CSS keys on;
 * `buttonSelector` matches that surface's three `[data-set-theme]` buttons.
 * Returns the applied preference so callers can assert in tests.
 */
export function initThemePref(root: HTMLElement, buttonSelector: string): ThemePref {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const buttons = () => root.querySelectorAll<HTMLButtonElement>(buttonSelector);

  function apply(pref: ThemePref) {
    root.dataset.theme = pref === "system" ? (mq.matches ? "dark" : "light") : pref;
    root.dataset.pref = pref;
    buttons().forEach((b) => b.classList.toggle("is-active", b.dataset.setTheme === pref));
  }

  const pref = readThemePref();
  apply(pref);

  buttons().forEach((b) =>
    b.addEventListener("click", () => {
      const next = b.dataset.setTheme;
      if (!isPref(next)) return;
      writeThemePref(next);
      apply(next);
    }),
  );

  // Only a "system" preference should follow the OS.
  mq.addEventListener("change", () => { if (root.dataset.pref === "system") apply("system"); });

  return pref;
}
