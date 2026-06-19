# 40 — Command Center Dashboard Design System

**Status:** active reference · **Owner:** Cleverwork · **First captured:** 2026-06-17

The canonical look-and-feel for Command Center audit dashboards. Chris approved
this pattern on the **Estimate Audit** page (`/operations/estimate-audit`) —
"extremely well done, I want to use this." Every new audit/drill-down surface
should match it. The reference implementations are:

- `src/pages/operations/estimate-audit.astro` + `src/scripts/estimate-audit.ts` — the **expand-tree** dashboard (Office → Job → Estimate → Line, editable)
- `src/pages/accounting/invoice-audit.astro` — the **two-panel** queue/detail dashboard (same tokens)

---

## 1. Design tokens (scope to a surface root, support light + dark)

Tokens live on a single scoped root class (`.ea`, `.ia-dash`) so the dashboard
theme never leaks into the app shell. Always ship **both** themes + a
System/Light/Dark toggle (localStorage-persisted, e.g. key `eaTheme`).

```css
/* light */
--bg:#f4f6f9; --panel:#ffffff; --panel2:#f7f8fb;
--ink:#1c2733; --muted:#6b7886; --line:#e3e8ef;
--brand:#5b46d8; --brand-bg:#efecfd;
--green:#137a4d; --green-bg:#e3f5ec;   /* good / healthy / yes */
--yellow:#946400; --yellow-bg:#fbf0d4; /* minor / partial / attention */
--orange:#a4480d; --orange-bg:#fbe7d6; /* moderate */
--red:#a51f1f;  --red-bg:#fbe2e2;      /* major / problem / no */
--grey:#5a6573; --grey-bg:#eceff4;     /* neutral / out-of-scope / TBD */
--shadow:0 6px 18px rgba(20,28,40,.08);

/* dark: same names, darkened surfaces + lightened ink/pills (see estimate-audit.astro) */
```

**Semantic color law:** green = good/yes/healthy, yellow = needs attention,
orange = moderate, red = problem/no, grey = neutral/out-of-scope/TBD/unknown.
Never use color decoratively — color always encodes status.

## 2. Spacing, padding, radius, type

| Element | Rule |
|---|---|
| Surface root padding | `18px var(--gutter,24px) 30px`; bleed into the shell with negative margins (`margin: calc(-1*space) calc(-1*gutter) ...`) so the dashboard background fills edge-to-edge |
| Card padding | `13–16px` (office/job rows `11–14px`; popups `inherit`) |
| Card radius | `14px` top-level cards, `10–11px` nested rows, `8px` inputs, `999px` pills |
| Grid gaps | `12px` between cards, `8px 16px` inside detail grids, `6–10px` between rows |
| Row min-height | toolbar inputs `36–44px`; nested summary rows `~40px` |
| Border | `1px solid var(--line)` everywhere; nested left-accent uses a 2px brand border when active |
| Shadow | only on hover / active (`--shadow`), never resting |
| Font | inherit app `--font-sans`; sizes: section label `10–11px` uppercase, body `12.5–13px`, values `15–16px`, headline `22px` |
| Tabular numbers | `font-variant-numeric: tabular-nums` on every money/qty/% cell |

## 3. Pills

```css
.pill{padding:2px 9px;border-radius:999px;font-size:11px;font-weight:600}
.pill-green/-yellow/-orange/-red/-grey/-brand → var(--x) on var(--x-bg)
```
Use a pill for every status, Y/N, tier, and TBD marker. `TBD` is always a
grey pill — it is the honest signal for "data not wired yet," never a blank.

## 4. KPI / summary boxes — the cognitive-load rule

> "Only have KPI boxes that take us to a better view or convey valuable
> information — too much causes cognitive overload." — Chris, 2026-06-17

- Every KPI box must **navigate** (link to a filtered drill-down) **or** convey a
  decision-relevant number. No decorative/vanity counts.
- Removed for this reason: the global work-queue status strip (live items / need
  review / blocked) once Work Queue was retired.
- Office summary KPIs (Jobs / Estimate / Proposal / Measured) are allowed because
  each is a real readiness signal and the row expands into the work.

## 5. The expand-tree pattern (preferred for drill-downs)

Native `<details>/<summary>` nesting, progressive disclosure, mostly no-JS:

```
<details class="ea-office"> Office summary + 4 KPIs
  <details class="ea-job"> Job summary (key pills) → detail grid
    <details class="ea-est"> Estimate summary (cost/margin stats)
      editable line table
```

- One chevron per level (`›` rotates 90° on `[open]`).
- Summary row shows the headline columns as inline pills; the full column set
  lives in a labeled `dl.detail-grid` inside the body (don't render 15-wide
  tables — wrap detail into a responsive grid).
- Auto-open when few top-level nodes (`open` when ≤2 offices).
- Filtering (search + scope select) shows/hides nodes; hide a parent when all
  children are hidden.
- Editing (margin %, qty, add/delete, one-off price) is event-delegated on the
  mount; recalc locally and toast "recalculated locally — not saved". **No
  external writes without human approval** (SOUL boundary).

## 5a. Line-item segmentation (roof-system categories) — site-wide standard

Any surface that lists material/product line items (invoice, order, agreement, estimate
lines) **must group lines into collapsible roof-system category sections** instead of one
overwhelming flat table. Chris approved this on Invoice Audit (2026-06-19): "the screens are
a bit overwhelming." Every line-list dashboard should function the same way.

- **Source of truth:** `public.roof_system_category` — 12 categories + `uncategorized`
  (Decking, Underlayment, Shingles, Flashing, Vents, Skylights, Low-Slope/Membrane,
  Gutters & Downspouts, Accessories, Tools & Consumables, Labor, Service Fees). Per-item
  resolution = `public.classify_roof_system(description, item_number)` (keyword classifier),
  overridden by `public.item_roof_system_category` when a row exists. Surface `category_key`
  on the line `v_*` view (`coalesce(override, classify_roof_system(...))`) and pass the
  ordered category list to the client in the payload.
- **Section UX:** each category is a `<details class="…-cat">` (**default-collapsed**, so a
  drill-down opens compact) ordered by `roof_system_category.sort_order`. Summary shows
  pills: line count · `$` subtotal · "N to audit" · at-risk rollup. One chevron, rotates on
  `[open]` (consistent with §5).
- **Filtering preference:** sections default-collapsed; in "to-audit only" mode hide
  fully-audited sections — `.<root>-pending-only .…-cat[data-pend="0"]{display:none}`.
- **Uncategorized is visible, never hidden** — it is the honest bucket for not-yet-mapped
  items (today: metal/tile roofing, siding). Refine via `item_roof_system_category`.

Reference implementation: `src/scripts/invoice-audit-tree.ts` (`invoiceBody` → category
sections) + `99-invoice-audit-views.sql` (`category_key`) + schema `114`.

## 6. Drill-down link behavior (scoped, never dump to entry page)

When a card/popup links into a dashboard, **carry the scope** (PE Office,
Vendor/Branch) as query params and have the target **pre-filter on load** — the
user should land on the already-filtered list, never the bare entry page left to
re-find their office. (Pattern: target reads `?office=`/`?branch=` and dispatches
its filter on mount.)

## 7. Toolbar

`search input · scope select(s) · spacer · runtime pill · count · theme toggle`,
flex-wrap, `gap:10px`, `margin-bottom:16px`. Runtime pill shows live/sample/
pending. Count line states the denominator ("5 of 12").

## 8. Checklist for a new dashboard

- [ ] Scoped root class with both light+dark tokens + theme toggle
- [ ] Live loader over a `v_*` view (sample fallback when unconfigured)
- [ ] Expand-tree or two-panel per the task; pills for all status
- [ ] KPIs navigate or inform — nothing decorative
- [ ] Scoped deep-links in/out (carry office/branch, pre-filter on land)
- [ ] Honest TBD pills for unwired fields; tabular numbers on all figures
- [ ] Line lists grouped into `roof_system_category` sections (default-collapsed) via `classify_roof_system` (§5a)
- [ ] List loaders paginate (`.range()`) — PostgREST caps a plain `.select()` at 1000 rows
- [ ] `npm run build` passes; verified on dev (reads prod DB)
