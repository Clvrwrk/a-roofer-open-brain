# Brand audit: CenterPoint dashboard mockup against ds.proexteriorsus.net

Audited 2026-11-17 against `@proexteriors/ds` v1.9.0. The mockup loads that version's own `tokens.css`, `components.css` and fonts, copied into `assets/` unchanged.

## Headline

The shell, header, scope control, KPI pills, panels, tables, status pills, meters and "Show all" all use ds classes as shipped. **Three things on the page are new patterns and need a ds PR before any build (G-04):** the bar charts, the six-stage flow strip, and the small stat grid. They are written with `cpd-` classes so nobody mistakes them for ds components. Every value they use is a `--pe-*` token.

## Rules the mockup relies on

| Rule | How the mockup meets it |
| --- | --- |
| S-01, S-02, S-03 | ds shell: 240px navy rail with the full logo, pale-navy active item; icon rail at ≤1100px; tab bar at ≤760px |
| S-04 | Header is eyebrow, h1, then actions. Only Help is shown; Search, Report a bug and Me are left to the real shell |
| S-11 | The Help icon is an inline SVG in `currentColor` |
| F-04 | One `.pe-seg` answers one question: which view (Executive, Operations, Sales). Selected is the solid navy fill |
| F-06, F-11 | The chosen view, theme and each "Show all" state persist in `localStorage`; the view goes in the address as `#view=` (a structured filter, never typed text) |
| P-01, P-02 | Every status is a `.pe-status` with dot, word and colour; only good, warning, danger, info, neutral |
| P-03, P-04 | Each KPI pill is a count of things to act on with one action button. Money that does not change the next step sits in the subtext |
| B-01 | No flag-red primary on any view; the dashboard is read-only |
| T-01, T-03 | Customers, crew and salesperson tables open at 10 rows with "Show all N". Home-card lists (largest balances, largest quotes) show 8 and link to the full list instead |
| T-06, Y-03 | Numbers are right-aligned in tabular figures |
| T-10, L-04 | No sideways scroll at 1440, 768 or 390px in light or dark (measured with Playwright, `scrollWidth − clientWidth = 0` on all 15 shots). Tables become card rows under 760px (`.pe-table--stack`) |
| C-02 | Flag red is not used in any chart |
| C-08 | Dark mode is per surface via `data-theme="dark"`; every element reads role tokens |
| K-01, K-03 | No literal colour or size values; no new custom properties |
| Y-01, Y-02 | Inter only, ds type scale only |
| A-03 | Links in text are underlined |

## Charts (new pattern, needs a ds PR)

- Colours are `--pe-viz-1` to `--pe-viz-4` plus `--pe-viz-other`, assigned in a fixed order and never by rank.
- The light palette passes every check of the dataviz validator (lightness band, chroma floor, colour-blind separation ΔE ≥ 14.9, normal-vision floor, contrast against white).
- **Finding for ds:** the dark palette fails the lightness-band check: `--pe-viz-2` (#CB9E00) and `--pe-viz-4` (#00B8D7) sit at L 0.721, just above the band. Separation and contrast still pass. This is a token question for ds, not something an app may override (K-03).
- One y axis per chart, never two. Thin bars with 4px rounded ends at the data end, 2px gaps between stacked parts, a legend whenever there are two or more series, value labels on horizontal bars, hover tooltips, and a "Show as table" view under every chart for screen readers and print.

## Not covered

- **axe (A-01)** was not run. The new chart markup adds SVG text and hover regions that need an axe pass and keyboard access to the tooltips before build.
- The real Command Center shell (Search, Report a bug, Me, full nav) is simplified here. The page would sit inside the real shell.
- The Command Center itself is not on ds tokens yet (see the earlier CenterPoint mockups' audit). This page is written ds-first, so it would be the first CC surface built on `--pe-*` tokens.
