// Pure HTML renderer for the /agents runtime board. Imported by BOTH the page
// (server render) and src/scripts/runtime-board.ts (30 s poll re-render), so the
// two never drift. No imports from @lib — types are mirrored from
// src/lib/runtime-status.ts (RuntimeBoard / RuntimeGroup / RuntimeComponent).

export type Light = "green" | "yellow" | "red" | "unknown";

export interface BoardComponent {
  key: string;
  group: string;
  kind: string;
  label: string;
  purpose: string;
  light: Light;
  headline: string;
  detail: string;
  cadenceLabel: string | null;
  lastAt: string | null;
  evidence: string[];
  href?: string;
}

export interface BoardGroup {
  id: string;
  label: string;
  description: string;
  counts: Record<Light, number>;
  components: BoardComponent[];
}

export interface BoardSource {
  name: string;
  light: Light;
  detail: string;
}

export interface Board {
  generatedAt: string;
  summary: Record<Light, number>;
  groups: BoardGroup[];
  sources: BoardSource[];
  deploy: { buildCommit: string | null; mainCommit: string | null };
  errors: string[];
}

/** Long-list disclosure (CONVENTIONS §11a): a group opens at 10 rows. */
export const ROW_LIMIT = 10;

export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const LIGHT_WORD: Record<Light, string> = { green: "Green", yellow: "Yellow", red: "Red", unknown: "Unknown" };

export function lightDot(light: Light, title?: string): string {
  return `<span class="rb-dot" data-light="${light}" role="img" aria-label="${esc(title ?? LIGHT_WORD[light])}" title="${esc(title ?? LIGHT_WORD[light])}"></span>`;
}

function fmtTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function renderSummary(board: Board): string {
  const s = board.summary;
  const total = s.green + s.yellow + s.red + s.unknown;
  const tile = (light: Light, label: string) =>
    `<div class="rb-tile" data-light="${light}"><span class="rb-tile-n">${s[light]}</span><span class="rb-tile-l">${lightDot(light)} ${label}</span></div>`;
  return `
    <div class="rb-summary" aria-label="Runtime summary">
      ${tile("red", "red")}${tile("yellow", "yellow")}${tile("green", "green")}${tile("unknown", "unknown")}
      <div class="rb-tile rb-tile-total"><span class="rb-tile-n">${total}</span><span class="rb-tile-l">components</span></div>
    </div>`;
}

export function renderSources(board: Board): string {
  return `<ul class="rb-sources" aria-label="Status sources">${board.sources
    .map((src) => `<li>${lightDot(src.light)}<strong>${esc(src.name)}</strong><span>${esc(src.detail)}</span></li>`)
    .join("")}</ul>`;
}

export function renderRow(c: BoardComponent): string {
  const evidence = c.evidence.length
    ? `<details class="rb-evidence"><summary>${c.evidence.length} note${c.evidence.length === 1 ? "" : "s"}</summary><ul>${c.evidence.map((e) => `<li>${esc(e)}</li>`).join("")}</ul></details>`
    : "";
  const label = c.href ? `<a href="${esc(c.href)}" target="_blank" rel="noopener">${esc(c.label)}</a>` : esc(c.label);
  return `
    <li class="rb-row" data-light="${c.light}" data-key="${esc(c.key)}">
      <div class="rb-row-light">${lightDot(c.light, `${LIGHT_WORD[c.light]} — ${c.headline}`)}</div>
      <div class="rb-row-main">
        <div class="rb-row-title"><strong>${label}</strong><span class="rb-row-purpose">${esc(c.purpose)}</span></div>
        <div class="rb-row-headline">${esc(c.headline)}</div>
        ${c.detail ? `<div class="rb-row-detail">${esc(c.detail)}</div>` : ""}
        ${evidence}
      </div>
      <div class="rb-row-meta">
        ${c.cadenceLabel ? `<span class="rb-cadence">${esc(c.cadenceLabel)}</span>` : ""}
        ${c.lastAt ? `<time datetime="${esc(c.lastAt)}">${esc(fmtTime(c.lastAt))}</time>` : ""}
      </div>
    </li>`;
}

export function renderGroup(g: BoardGroup, expanded: boolean): string {
  const n = g.components.length;
  const disclose = n > ROW_LIMIT;
  const rows = g.components.map(renderRow).join("");
  const counts = (["red", "yellow", "green", "unknown"] as Light[])
    .filter((l) => g.counts[l] > 0)
    .map((l) => `<span class="rb-count" data-light="${l}">${lightDot(l)}${g.counts[l]}</span>`)
    .join("");
  return `
    <section class="rb-group" data-group="${esc(g.id)}" data-expanded="${disclose && expanded ? "true" : "false"}" aria-label="${esc(g.label)}">
      <header class="rb-group-head">
        <div><h3>${esc(g.label)}</h3><p>${esc(g.description)}</p></div>
        <div class="rb-group-counts">${counts}</div>
      </header>
      <ul class="rb-rows" data-limit="${ROW_LIMIT}">${rows}</ul>
      ${disclose ? `<button type="button" class="rb-show-all" data-group-toggle="${esc(g.id)}" aria-expanded="${expanded ? "true" : "false"}">${expanded ? `Show first ${ROW_LIMIT}` : `Show all ${n} …`}</button>` : ""}
    </section>`;
}

export function renderBoard(board: Board, expandedGroups: Set<string>): string {
  return `
    ${renderSummary(board)}
    ${renderSources(board)}
    ${board.errors.length ? `<p class="rb-errors">${board.errors.map(esc).join(" · ")}</p>` : ""}
    <div class="rb-groups">${board.groups.map((g) => renderGroup(g, expandedGroups.has(g.id))).join("")}</div>`;
}

export function renderLegend(): string {
  return `
    <ul class="rb-legend" aria-label="Colour legend">
      <li>${lightDot("green")} <strong>Green</strong> — last run succeeded within 1.5× its cadence; feed current; monitor up.</li>
      <li>${lightDot("yellow")} <strong>Yellow</strong> — late (1.5–2× cadence), finished with warnings, fresh-but-empty feed, heartbeat pending, or Better Stack not configured.</li>
      <li>${lightDot("red")} <strong>Red</strong> — last run failed, overdue past 2× cadence, feed stale, matview lagging, monitor or heartbeat down, monitor paused.</li>
      <li>${lightDot("unknown")} <strong>Unknown</strong> — no telemetry yet (a job that never reported, a function without outcome wiring).</li>
    </ul>`;
}
