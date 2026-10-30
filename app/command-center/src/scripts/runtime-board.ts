// /agents runtime board — client half (docs/109 D6). Renders the server-embedded
// board immediately, then polls /api/system/runtime-status every 30 s while the
// tab is visible. Long-list disclosure state persists per group in localStorage
// and the pane keeps a fixed 10-row height when expanded (CONVENTIONS §11a).
import { ROW_LIMIT, renderBoard, type Board } from "./runtime-board-render";

const POLL_MS = 30_000;
const STORAGE_PREFIX = "runtime-board:expanded:";

function readEmbeddedJson<T>(id: string, fallback: T): T {
  const el = document.getElementById(id);
  if (!el?.textContent) return fallback;
  try {
    return JSON.parse(el.textContent) as T;
  } catch {
    return fallback;
  }
}

function loadExpanded(): Set<string> {
  const out = new Set<string>();
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(STORAGE_PREFIX) && localStorage.getItem(k) === "1") out.add(k.slice(STORAGE_PREFIX.length));
    }
  } catch {
    /* storage unavailable — default collapsed */
  }
  return out;
}

function saveExpanded(group: string, expanded: boolean) {
  try {
    if (expanded) localStorage.setItem(STORAGE_PREFIX + group, "1");
    else localStorage.removeItem(STORAGE_PREFIX + group);
  } catch {
    /* ignore */
  }
}

/** Measure the collapsed (10-row) height and pin it so expansion scrolls inside the pane. */
function applyPaneHeights(root: HTMLElement) {
  for (const list of root.querySelectorAll<HTMLElement>(".rb-rows")) {
    const rows = Array.from(list.children) as HTMLElement[];
    if (rows.length <= ROW_LIMIT) {
      list.style.maxHeight = "";
      list.style.overflowY = "";
      continue;
    }
    const group = list.closest<HTMLElement>(".rb-group");
    const expanded = group?.dataset.expanded === "true";
    // Measure the first 10 rows with the rest hidden, never a hardcoded number.
    rows.forEach((row, i) => { row.hidden = i >= ROW_LIMIT; });
    const collapsedHeight = list.getBoundingClientRect().height;
    if (expanded) {
      rows.forEach((row) => { row.hidden = false; });
      list.style.maxHeight = `${Math.ceil(collapsedHeight)}px`;
      list.style.overflowY = "auto";
    } else {
      list.style.maxHeight = "";
      list.style.overflowY = "";
    }
  }
}

function paint(root: HTMLElement, board: Board, expanded: Set<string>) {
  root.innerHTML = renderBoard(board, expanded);
  applyPaneHeights(root);
  const asOf = document.querySelector<HTMLElement>("[data-rb-as-of]");
  if (asOf) asOf.textContent = new Date(board.generatedAt).toLocaleTimeString();
}

function main() {
  const root = document.getElementById("runtime-board");
  if (!root) return;
  const expanded = loadExpanded();
  let board = readEmbeddedJson<Board | null>("runtime-board-data", null);
  if (board) paint(root, board, expanded);

  root.addEventListener("click", (event) => {
    const btn = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-group-toggle]");
    if (!btn || !board) return;
    const group = btn.dataset.groupToggle!;
    if (expanded.has(group)) expanded.delete(group);
    else expanded.add(group);
    saveExpanded(group, expanded.has(group));
    paint(root, board, expanded);
  });

  const status = document.querySelector<HTMLElement>("[data-rb-poll]");
  async function refresh() {
    if (document.hidden) return;
    try {
      const res = await fetch("/api/system/runtime-status", { credentials: "same-origin", cache: "no-store", headers: { accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      board = (await res.json()) as Board;
      paint(root!, board, expanded);
      if (status) { status.textContent = "live · 30 s"; status.dataset.tone = "ready"; }
    } catch (error) {
      if (status) { status.textContent = `refresh failed (${error instanceof Error ? error.message : "network"})`; status.dataset.tone = "watch"; }
    }
  }
  window.setInterval(() => { void refresh(); }, POLL_MS);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) void refresh(); });
  window.addEventListener("resize", () => { if (root) applyPaneHeights(root); });
  if (!board) void refresh();
}

main();
