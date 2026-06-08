# Pro Exteriors — Open Brain Admin Design System

Version 1.0 · Light scheme · WCAG AA

This document is the written specification for the Vendor Pricing Command Center admin. It defines the tokens, color roles, type, shape, elevation, and components that every screen draws from. The relationship between the three artifacts is fixed:

- **`Design.md`** (this file) — the specification. What the system is and why.
- **`design-system.html`** — the living styleguide. The system rendered, for visual reference.
- **`src/styles.css`** — the authoritative implementation. The tokens and component rules in code.

When the three ever disagree, `src/styles.css` is correct and the other two are updated to match. No screen introduces a color, radius, or font that is not a named token here (DSN-010 / DSN-014).

---

## Principles

**Five-color role discipline (DSN-011).** Each brand color owns exactly one job and is never borrowed for decoration. Flag red is the only affirmative CTA on screen; golden orange is attention and never a button; hunter green means success status and nothing else; navy is authority and structure; smart blue is links and data. This is the rule the whole system hangs on.

**Contrast-Layer depth.** Separation between surfaces comes from borders and surface tints, not drop shadows. The work surface is flat. Shadow is an exception reserved for genuinely floating layers and for the selected-item lift — not a default decoration.

**One affirmative action per field (DSN-012).** Any single viewport contains exactly one flag-red primary action. Everything else is a navy or ghost secondary. The user is never asked to choose between two competing "yes" buttons. Where a screen would otherwise have two primaries (e.g. the topbar "Run Pilot Audit" alongside an in-body "Approve"), the lower-priority one demotes to navy so the flag red stays singular.

**On-system or off (DSN-010 / DSN-014).** Every value is a token — color, radius, **spacing, and layout** alike. No one-off hex, no ad-hoc pixel radius, no magic-number margin, no second typeface. If a needed value is missing, it is added to `:root` deliberately rather than inlined. Spacing and layout were the last holdouts here; see [Layout & spacing](#layout--spacing).

**One content rail.** Every band on a page — full-bleed or not — aligns to a single shared container. Alignment is a structural guarantee, not something achieved by matching numbers per element. When edges drift, the cause is almost always a second definition of "the column"; the fix is to delete it, not to nudge it.

**Declared ink, never inherited.** Anything that sets a `background` must also declare its own `color`. An element that fills its background but inherits its text color is making a bet about its surroundings, and that bet breaks the moment it is composed onto a different surface. This is enforced structurally (contextual tokens) and automatically (linting + CI) — see [Defensive styling](#defensive-styling).

**Mono is excluded here (DSN-013).** A monospace face is reserved for Property Card surfaces. The admin is not one, so mono is not loaded.

---

## Color tokens

All colors live in `:root` in `src/styles.css`. Reference them by token name, never by literal hex.

### Brand palette

| Token | Hex | Role |
|---|---|---|
| `--color-primary` | `#11133f` | Deep navy — authority surfaces, structure, primary text |
| `--color-primary-container` | `#0a0c27` | Darkest navy — rail gradient base, hover depth |
| `--color-primary-soft` | `#bbbeed` | Soft navy tint for light-surface fills |
| `--color-on-primary` | `#ffffff` | Text/icons on navy |
| `--color-secondary` | `#3b6b4c` | Hunter green — success / affirmative **status** only |
| `--color-secondary-container` | `#24412e` | Deep green — text on green-soft pills |
| `--color-secondary-soft` | `#d3e7da` | Green tint — "Ready" / "Approved" pill fill |
| `--color-tertiary` | `#c22326` | Flag red — the single affirmative CTA (interaction only) |
| `--color-tertiary-container` | `#9b1c1f` | Deep flag red — primary-action hover |
| `--color-on-tertiary` | `#ffffff` | Text on flag red |
| `--color-accent` | `#eaa221` | Golden orange — eyebrows on navy, badges, attention. **Never a button** |
| `--color-accent-soft` | `#fbedd2` | Amber tint — "Review" / "Sent" pill fill |
| `--color-on-accent` | `#000000` | Text on golden orange |
| `--color-on-accent-soft` | `#11133f` | Text on amber tint |
| `--color-info` | `#0066cc` | Smart blue — inline links and data meters |
| `--color-info-soft` | `#c2e0ff` | Blue tint — "Draft" pill fill |
| `--color-on-info-soft` | `#11133f` | Text on blue tint |

### Surface & ink

| Token | Hex | Role |
|---|---|---|
| `--color-surface` | `#ffffff` | Card and work-surface base |
| `--color-surface-elevated` | `#ffffff` | Elevated surface (same value, semantic alias) |
| `--color-surface-inset` | `#f9fafb` | Page background, inset tiles, draft boxes |
| `--color-surface-alt` | `#f3f4f6` | Segmented track, meter track, hover fill |
| `--color-surface-dark` | `#111827` | Dark surface |
| `--color-on-surface` | `#111827` | Primary text ink |
| `--color-on-surface-secondary` | `#374151` | Secondary text; light-surface eyebrows (AA-safe) |
| `--color-on-surface-muted` | `#4b5563` | Muted labels, table headers, timestamps |
| `--color-on-surface-dark` | `#ffffff` | Text on dark surface |
| `--color-border` | `#e5e7eb` | The workhorse — carries all contrast-layer separation |
| `--color-border-subtle` | `#f3f4f6` | Faint dividers where a full border is too heavy |

### Semantic status

The error family is deliberately distinct from flag-red tertiary: red that means "stop", not red that means "go".

| Token | Hex | Role |
|---|---|---|
| `--color-success` | `#059669` | Success semantic |
| `--color-warning` | `#d97706` | Warning semantic |
| `--color-error` | `#dc2626` | Error semantic (borders, emphasis) |
| `--color-error-surface` | `#fef2f2` | Blocked pill / danger button fill |
| `--color-error-text` | `#7f1d1d` | Text on error surfaces |

---

## The five-color role discipline (DSN-011)

| Color | Owns | Never used for |
|---|---|---|
| **Primary** (navy) | Authority surfaces (rail, section heads), structure, primary text | Affirmative CTAs |
| **Secondary** (hunter green) | Success / affirmative *status* (Ready, Approved) | Buttons, decoration |
| **Tertiary** (flag red) | The one affirmative CTA per viewport | Decoration, status, error |
| **Accent** (golden orange) | Eyebrows on navy, badges, wayfinding, attention | Buttons of any kind |
| **Info** (smart blue) | Inline links, data meters | Primary actions, status pills |

**Do**
- Keep one flag-red affirmative action in view.
- Use accent orange for the active nav marker and for eyebrows on navy.
- Reach for borders before shadows to separate surfaces.

**Don't**
- Make accent orange a button, or make the CTA green.
- Put golden-orange eyebrows on white — it fails AA. Use `--color-on-surface-secondary` instead.
- Introduce a hex value that isn't a token.

---

## Typography

One family: **Inter**, with a system fallback stack, in four weights (400, 600, 700, 800).

```
--font-sans: "Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
```

| Style | Weight | Size | Line / tracking | Used for |
|---|---|---|---|---|
| Display / view title | 800 | `clamp(30px, 3vw, 44px)` | 1.05 · −0.02em | `.topbar h2` |
| Stat / metric value | 800 | 30px | 1.05 · −0.02em | `.metric strong` |
| Heading 1 (rail) | 700 | 24px | 1.15 · −0.02em | `.brand-block h1` |
| Heading 3 (section) | 600 | 20px | 1.25 | `.section-head h3` |
| Body | 400 | 14px | 1.5 | default text |
| Meta / note | 400 | 13px | 1.45 · secondary ink | `.queue-meta`, `.small-note` |
| Eyebrow / label-caps | 700 | 12px | 0.1em · uppercase | `.eyebrow` |
| Table header | 700 | 11px | 0.04em · uppercase · muted ink | `th` |

---

## Shape

A five-step radius scale. `md` (8px) is the default for nearly everything — buttons, cards, inputs, tiles. `full` is reserved for pills and dots.

| Token | Value | Used for |
|---|---|---|
| `--radius-sm` | `4px` | Segments inside the segmented control |
| `--radius-md` | `8px` | **Default** — buttons, surfaces, inputs, tiles |
| `--radius-lg` | `12px` | Larger documentation cards |
| `--radius-xl` | `16px` | Reserved for oversized containers |
| `--radius-full` | `9999px` | Status pills, dots, meter track |

---

## Layout & spacing

This section exists because alignment kept drifting, and the cause was always the same: spacing and layout were never tokenized the way color and radius were, so every margin was a magic number and every band defined "the column" slightly differently. The discipline below makes misalignment structurally impossible rather than a thing reviewers have to catch by eye.

### The container — one rail for every band

A page has exactly one content rail. It is capped, centred, and has a fluid gutter. Full-bleed regions (the navy masthead, the sticky nav bar) put their **background** on the band element and their **content** inside `.container`, so everything lines up on the same left and right edges regardless of whether the background spans the viewport.

```css
.container {
  width: 100%;
  max-width: var(--container);   /* cap the measure */
  margin-inline: auto;           /* centre it */
  padding-inline: var(--gutter); /* fluid side space */
}
```

There is never a second container definition. The masthead inner, the nav inner, and the body column all use this exact rail. The earlier 24px stagger between the masthead and the body — and the nav links escaping to the window edge — were both symptoms of three competing column definitions; collapsing them to one `.container` removes the entire class of bug.

### Layout tokens

| Token | Value | Why |
|---|---|---|
| `--container` | `72rem` (~1152px) | Caps line length for readability on wide monitors. Wide enough for the reference tables, not a 1080px squeeze, not unbounded. |
| `--gutter` | `clamp(1rem, 4vw, 3rem)` | Side space scales with the viewport (16px on a phone → 48px on a desktop) without ever letting content touch the edge. |

### Fluid within bounds — the % vs fixed decision

Neither extreme is correct, and "switch everything to %" would make reading *worse*:

- **Pure `%`** (e.g. `width: 80%`) produces 2000px+ line lengths on a wide monitor — genuinely hard to read — and gives no floor on small screens.
- **Pure fixed** (e.g. `width: 1080px; padding: 24px`) is cramped on a 380px phone and leaves dead, non-scaling space on a large display.
- **The model we use** is a hybrid: `max-width` caps the measure, `margin-inline:auto` centres it, and a `clamp()` gutter gives the fluid, viewport-responsive feel — "%-behaviour within sane bounds."

**Per-context exception.** This applies to reading and content surfaces. Application chrome is different: fixed structural rails (e.g. the admin's `280px` sidebar) should stay fixed, not rubber-band as the window resizes. Fluid-vs-fixed is a deliberate choice per context, not a blanket rule.

### Spacing scale — 4px base

Every margin, padding, and gap is one of these tokens. Named by its multiple of 4. A value that isn't on the scale doesn't ship.

| Token | px | Common use |
|---|---|---|
| `--space-1` | 4 | Hairline gaps (nav link gap) |
| `--space-2` | 8 | Tight inline gaps |
| `--space-3` | 12 | Control padding, nav-bar block padding |
| `--space-4` | 16 | In-card gaps, between stacked cards |
| `--space-5` | 20 | — |
| `--space-6` | 24 | Card padding, default block spacing |
| `--space-8` | 32 | Generous internal spacing |
| `--space-10` | 40 | Band separation (masthead / nav to content) |
| `--space-12` | 48 | Large block padding |
| `--space-16` | 64 | Section-to-section rhythm |

The scale is intentionally sparse above 24px (steps of 8, then 16) — large spacing wants fewer, more decisive choices, not a continuum.

### Rules

- Every band aligns to `.container`. Never reintroduce a one-off width or a negative-margin hack to fake full-bleed — use background-on-band, content-in-container.
- Every gap is a `--space-*` token. No raw pixel margins or paddings in component CSS.
- Gutters are fluid (`clamp`), measures are capped (`max-width`), structural app rails are fixed — by intent, per context.

---

## Elevation

Depth is mostly carried by borders (Contrast-Layer model). Shadow is an exception, not a default.

| Level | Value | Used for |
|---|---|---|
| Flat | border only | All default surfaces — cards, work surfaces, tables |
| Selection lift | `0 12px 32px rgba(17,19,63,0.1)` | `.queue-item:hover` / `.is-selected` |
| Float | `--shadow-float: 0 20px 60px rgba(17,19,63,0.14)` | Genuinely floating layers |

---

## Components

Full live specimens are in `design-system.html`. Each maps to a class in `src/styles.css`.

### Buttons

Strict four-variant hierarchy. Exactly one primary per field (DSN-012).

| Variant | Class | Appearance | Use |
|---|---|---|---|
| Primary | `.primary-action` | Flag red, white text | The single affirmative CTA |
| Navy secondary | `#run-audit` | Navy fill | High-emphasis secondary when a flag-red CTA already exists |
| Ghost | `.secondary-action`, `.inline-action` | White fill, navy text, border | Neutral / inline actions |
| Destructive | `.danger-action` | Error-surface fill, error text | Reject / delete — error family, not the CTA red |

### Status pills

`.status-pill` + a semantic modifier. Always carry a text label, never color alone.

| Class | Fill / text | Meaning |
|---|---|---|
| `.status-ready`, `.status-approved` | green-soft / secondary-container | Ready, Approved |
| `.status-review`, `.status-sent` | accent-soft / on-accent-soft | In Review, Sent |
| `.status-draft` | info-soft / on-info-soft | Draft |
| `.status-blocked`, `.status-rejected` | error-surface / error-text | Blocked, Rejected |

### Metric card — `.metric`

KPI tile: uppercase muted label, oversized 800-weight stat, optional delta note (`em`, rendered non-italic). Laid out in `.metric-grid`.

### Work surface & section head — `.work-surface` / `.section-head`

The core container. A navy `.section-head` band labels each workspace (white `h3`, accent eyebrow) above a flat white body. This is what breaks the white field into legible zones without shadows.

### Side rail — `.side-rail` / `.nav-item`

Navy authority surface with a vertical gradient. The active nav item (`.is-active`) is marked by an **accent left-border** — wayfinding, not action. Hover/focus reveals a subtle white border.

### Segmented control — `.segmented` / `.segment`

Inline filter switch on a `surface-alt` track. The active segment fills navy with white text.

### Queue item — `.queue-item`

List card with a navy left-border. On hover or selection the left-border turns accent and the card lifts (selection-lift shadow). The dominant list-detail interaction object.

### Data table — `table`

Uppercase muted `th` headers (11px), 14px rows, border-separated. Status lives in pills inside cells. Wrapped in `.table-wrap` for horizontal scroll.

### Match meter — `.meter` / `.match-score`

Data visualization. The fill is a smart-blue → navy gradient — deliberately **not** the flag-red CTA color, keeping data distinct from action.

### Input — `.setting-input` / `.setting-select`

On focus the border moves to navy. No glow, no off-system focus color.

---

## Patterns

**Copy-then-act reminder — `.blink-cta`.** When a workflow needs the user to copy content before proceeding, the next-step button blinks accent ↔ flag-red (`@keyframes blink-cta`, 0.7s stepped loop) until clicked. This is the one sanctioned use of motion in the system — it signals a required action, never decoration.

**Two-column work layout — `.two-column` / `.two-column.wide-left`.** List-plus-detail is the dominant page shape: a queue on the left, the selected record on the right. `.wide-left` flips the column emphasis when the list itself is the primary object (e.g. Credit Memos, Territories).

---

## Accessibility (DSN-005)

Every text/background pairing meets WCAG AA. The consequences worth remembering:

- **Eyebrows shift by surface.** Golden-orange eyebrows pass on navy (~6.5:1) but fail on white, so light-surface eyebrows use `--color-on-surface-secondary` (#374151, 9.3:1). The accent eyebrow appears only on the dark rail and section heads.
- **Status is never color-only.** Pills carry a word as well as a fill.
- **Focus is visible.** Inputs move their border to navy; nav and segmented controls expose a `:focus-visible` state.
- **Comfortable hit areas.** Buttons ≥40px min-height, nav items 42px, segments 32px.
- **Motion is minimal and purposeful** — the single blink pattern, nothing else.

---

## Responsive behavior

| Breakpoint | Change |
|---|---|
| ≤ 1080px | Rail un-sticks and stacks to top; nav becomes a 3-up grid; all two-column / metric / settings grids collapse to one column |
| ≤ 680px | Reduced stage padding; topbar stacks; action rows become full-width single columns; nav becomes 2-up |

---

## Defensive styling

The masthead in `design-system.html` once shipped unreadable `code` chips: a light fill with no declared text color, inheriting white from the navy band. The fix is structural, not a matter of more care next time — make the bug impossible to express, then let tooling catch what still slips through. This is the most reliable lever, because correctness then no longer depends on remembering, per element, which surface it will eventually sit on.

### The rule

Anything that sets a `background` must also declare its own `color`. Never rely on inherited `color` for a filled or bordered element, and never hard-code a one-off override for a single placement ("fix it on the hero") — fix the system instead.

### Contextual tokens — surfaces provide, primitives consume

Define foreground/background pairs on each surface context. Primitives reference the contextual variable, so they render correctly anywhere with zero per-instance overrides. This generalizes the `--color-on-primary` / `--color-on-accent` convention the palette already uses to *every* primitive.

```css
/* Surfaces PROVIDE the ink */
:root,
.surface-light { --fg: #111827; --chip-bg: #f3f4f6; --chip-fg: #11133f; }
.surface-dark  { --fg: #ffffff; --chip-bg: rgba(255,255,255,.14); --chip-fg: #ffffff; }

/* Primitives CONSUME it — placement-agnostic */
code { color: var(--chip-fg); background: var(--chip-bg); }
```

A `<code>` styled this way is correct on light or dark with no overrides; the masthead bug could not have occurred.

### Catch it automatically

Prevention by construction removes most occurrences; these guards remove the rest, so correctness doesn't depend on review-by-eye.

| Guard | Catches | When |
|---|---|---|
| **Stylelint** (`background ⇒ color` rule) | Any `background` declared without a paired `color` | As you type / pre-commit |
| **axe-core** (Playwright or `pa11y-ci`) | Rendered contrast failures — incl. white-on-light-gray — on built pages | CI, fails the build |
| **Lighthouse CI** | Contrast + broader a11y regressions, as a lighter backstop | CI / preview deploys |

---

## Astro notes

How this system is meant to live in an Astro codebase — where the inherited-ink bug recurs most, because components are authored in isolation and composed somewhere else entirely. Astro scopes each component's `<style>` by default, but inheritance (`color`, `font`) and custom properties still cascade through; **scoping does not protect you from this class of bug.**

**Where tokens live.** Put the `:root` tokens and the contextual `.surface-*` pairs in one global stylesheet imported once in the root layout — not in a scoped `<style>` block, or the custom properties won't reliably reach every component. Use `<style is:global>` only for that token layer; keep everything else scoped.

**A Surface component sets the context.** Wrap any dark (or otherwise non-default) region in a component that switches the contextual variables; primitives dropped inside it adapt automatically.

```astro
---
// Surface.astro
const { variant = "light" } = Astro.props;
---
<div class={`surface-${variant}`}><slot /></div>

<!-- usage -->
<Surface variant="dark">
  <Masthead />   <!-- Code, Pill, Card inside all read --chip-fg -->
</Surface>
```

The primitive never knows its surface; the surface declares the ink. That inversion is what makes correctness independent of the prompt that generated the component.

**Enforce on the build output.** Astro compiles to static HTML, which is ideal for automated auditing. Run `stylelint` over `.astro` and `.css` files (pre-commit + CI), and after `astro build` run `@axe-core/playwright` or `pa11y-ci` against `dist/`, failing the pipeline on any contrast violation. This is the guard that makes the bug impossible to ship, regardless of how any single component was generated.

---

## Adding to the system

1. Decide whether a need is genuinely new or an existing token already covers it. Reuse first.
2. If new, add a named token to `:root` in `src/styles.css` — never inline a literal.
3. Confirm the color obeys the role discipline (DSN-011) and passes AA on its surfaces (DSN-005).
4. Declare `color` alongside any `background`; consume contextual ink rather than inheriting it (see [Defensive styling](#defensive-styling)).
5. Align every band to the one `.container` rail; take all spacing from the `--space-*` scale — no magic numbers (see [Layout & spacing](#layout--spacing)).
6. Update this `Design.md` and add a specimen to `design-system.html` so all three artifacts stay in sync.
7. Let the guards confirm it: Stylelint clean, and the axe/CI contrast pass green against the built output.
