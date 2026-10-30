// Design tokens read from the production stylesheet at build time.
//
// global.css `:root` is the one place tokens are defined (Design.md "On-system or
// off"). This module parses that block so the design-system pages and the
// /design-system/tokens.json feed always show what production actually ships —
// never a hand-copied table that can drift.

import css from "../../styles/global.css?raw";

export interface Token {
  name: string; // "--color-primary"
  value: string; // "#11133f" or "var(--color-primary)"
  resolved: string; // literal after following var() chains
  group: TokenGroup;
}

export type TokenGroup = "color" | "radius" | "font" | "shadow" | "space" | "layout" | "alias";

function groupFor(name: string, value: string): TokenGroup {
  if (name.startsWith("--color-")) return "color";
  if (name.startsWith("--radius")) return "radius";
  if (name.startsWith("--font")) return "font";
  if (name.startsWith("--shadow")) return "shadow";
  if (name.startsWith("--space")) return "space";
  if (name === "--container" || name === "--gutter") return "layout";
  if (value.startsWith("var(")) return "alias";
  return "color";
}

function parseRoot(): Map<string, string> {
  const start = css.indexOf(":root {");
  const end = css.indexOf("\n}", start);
  const block = css.slice(start, end);
  const map = new Map<string, string>();
  for (const line of block.split("\n")) {
    const m = line.match(/^\s*(--[a-z0-9-]+):\s*(.+?);\s*$/i);
    if (m) map.set(m[1], m[2].trim());
  }
  return map;
}

const raw = parseRoot();

function resolve(value: string, depth = 0): string {
  if (depth > 8) return value;
  const m = value.match(/^var\((--[a-z0-9-]+)\)$/i);
  if (m && raw.has(m[1])) return resolve(raw.get(m[1])!, depth + 1);
  return value;
}

export const tokens: Token[] = Array.from(raw.entries()).map(([name, value]) => ({
  name,
  value,
  resolved: resolve(value),
  group: groupFor(name, value),
}));

export function token(name: string): Token | undefined {
  return tokens.find((t) => t.name === name);
}

export function tokensIn(group: TokenGroup): Token[] {
  return tokens.filter((t) => t.group === group);
}

/** The dark-mode mapping this design system defines for every light token that changes. */
export const darkOverrides: Record<string, string> = {
  "--color-surface": "#161d27",
  "--color-surface-elevated": "#1c2530",
  "--color-surface-inset": "#0f141b",
  "--color-surface-alt": "#1a2230",
  "--color-on-surface": "#e6edf5",
  "--color-on-surface-secondary": "#c3ccd8",
  "--color-on-surface-muted": "#8b98a8",
  "--color-border": "#27313e",
  "--color-border-subtle": "#1f2937",
  "--border-strong": "#3a4657",
  "--color-primary-soft": "#2a2f6b",
  "--color-secondary-soft": "#123626",
  "--color-secondary-container": "#7ee2ad",
  "--color-accent": "#f2cf6b",
  "--color-accent-soft": "#3a3115",
  "--color-on-accent-soft": "#f2cf6b",
  "--color-info": "#7cb7ff",
  "--color-info-soft": "#152a45",
  "--color-on-info-soft": "#c2e0ff",
  "--color-success": "#7ee2ad",
  "--color-warning": "#f3a766",
  "--color-error": "#ff8585",
  "--color-error-surface": "#3d1a1a",
  "--color-error-text": "#ffb4b4",
  "--shadow": "0 12px 32px rgba(0, 0, 0, 0.45)",
  "--shadow-float": "0 20px 60px rgba(0, 0, 0, 0.55)",
};

// ── Color maths (used by the Color chapter to MEASURE contrast rather than assert it) ──

export function hexToRgb(hex: string): [number, number, number] | null {
  const m = hex.trim().match(/^#([0-9a-f]{6})$/i);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function luminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

export function wcag(ratio: number, large = false): "AAA" | "AA" | "AA-large" | "Fail" {
  if (ratio >= 7) return "AAA";
  if (ratio >= 4.5) return "AA";
  if (ratio >= 3) return large ? "AA" : "AA-large";
  return "Fail";
}

/** Naive sRGB→CMYK for the spec tables (print vendors re-separate from Pantone anyway). */
export function hexToCmyk(hex: string): [number, number, number, number] {
  const rgb = hexToRgb(hex);
  if (!rgb) return [0, 0, 0, 100];
  const [r, g, b] = rgb.map((c) => c / 255);
  const k = 1 - Math.max(r, g, b);
  if (k === 1) return [0, 0, 0, 100];
  const c = (1 - r - k) / (1 - k);
  const m = (1 - g - k) / (1 - k);
  const y = (1 - b - k) / (1 - k);
  return [c, m, y, k].map((v) => Math.round(v * 100)) as [number, number, number, number];
}
