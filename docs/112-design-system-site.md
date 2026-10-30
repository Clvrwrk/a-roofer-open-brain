# 112 — The living design system at `/design-system`

**Status:** active · **Owner:** Cleverwork · **Shipped:** 2026-09-14 · **Route:** https://cc.proexteriorsus.net/design-system (WorkOS-gated like every route)

## What it is

```
global.css :root ──parse at build──▶ tokens.ts ──▶ 18 chapter pages (src/pages/design-system/*.astro)
                                              └──▶ /design-system/tokens.json (machine feed)
docs/40 · standards/design/v1.md · Design.md · context/memory ──▶ decisions log (decisions.astro)
config/brand/assets/logo_color.png ──fal.ai GPT Image 2.5 (edit)──▶ public/design-system/swag/*.jpg + manifest.json
```

The design system is now a site inside the Command Center, not a document beside it. Every
colour, radius, spacing and font value it shows is parsed from the production stylesheet at
build time; every contrast ratio is measured; every specimen is production markup styled by
production CSS and re-renders in whichever mode the reader picks. Rules carry permanent ids
(`C-04`, `CMP-12`, `UX-06` …) that PRs and issues cite.

## Chapters

| Group | Chapters |
|---|---|
| Foundations | Overview (first-principles method, precedence) · Color & Pantone · Logo & mark · Typography · Spacing, layout & grid · Icons, imagery & alt text |
| Surfaces | Component library (20 components, live in both modes) · Light & dark mode (mechanism + full token mapping + per-component behaviour) |
| Behaviour | Motion (13 catalogued motions, each live) · Dashboards & data (Tufte applied) · UX decisions log (nesting, filters, tables, feedback, actions, nav, never-do list) · Mobile & responsive · Accessibility · Content & microcopy |
| Collateral | Print, brochures & infographics · Swag & apparel (12 fal.ai renders + per-item production spec) · Landing pages & marketing web |
| Governance | Agent handbook (build recipe, ship checklist, file map, token feed, escalation, changelog) |

## Decisions made while building it

- **The site has its own rail.** Chapters are the navigation; the department rail would compete with them. `DesignSystemShell.astro` reuses the shell's fonts, tokens and rail styling but lists chapters. A "← Command Center" link and a nav leaf under AI Agents connect the two.
- **Dark mode on the site is a shell-level demonstration.** Production dark mode is per-surface (Chris, 2026-06-17). The site's root carries `data-theme` from the same `cc.theme` preference and defines the canonical dark mapping (`design-system.css`, mirrored in `tokens.ts darkOverrides`). It is the reference a future shell-level dark mode copies.
- **Alias gotcha, recorded.** `--surface`, `--text` and the other short aliases are declared on `:root` as `var(--color-*)`, so they resolve *there*, against light values; overriding `--color-*` on a descendant does not reach them. A dark scope must re-point the aliases too. The site does; a future shell dark mode must.
- **`--error-surface` / `--error-text` were consumed but never declared** (`.button-danger`, `.priority-critical`, credit-memo panel). Added to `:root` as aliases of `--color-error-*`. Destructive buttons had been rendering with no fill.
- **Tokens are parsed, never copied.** `src/lib/design-system/tokens.ts` reads `global.css?raw` and resolves `var()` chains. Contrast is computed with the WCAG formula at build time.
- **Board specimens use `cash-surface.css`** (`.cfx`), the shareable copy of the canonical `.fw` vocabulary, with a `MutationObserver` syncing the page theme onto each specimen board.
- **Swag renders are references, not artwork.** Generated with `scripts/design-system-swag.mjs` (fal.ai `openai/gpt-image-2.5/flare/edit`, logo passed as the reference image), downsampled to 960px JPEG q82 (≤ 250 KB), with provenance in `manifest.json`. Alt text written from the render. Requires `FAL_KEY` in the environment; never committed.
- **Pantone numbers are nearest solid-coated matches** by sRGB comparison and are marked as such; the rule (C-07) is a physical proof against the fan before any run over 100 units.

## Recorded gaps (honest, not fixed here)

- No `:focus-visible` rules in `global.css`; browsers' default ring shows. Rule A-02 defines the ring; adopt it on the shell and boards.
- Two shell cards carry a resting shadow (`.metric-panel`, `.gap-metric-card`) against Design.md's elevation model (CMP-12).
- Invoice Audit's `--brand` resolves to a violet in dark mode; not a token; tolerated until that surface's next redesign (Color → Audit-surface palettes).
- `price-agreement/review` and `price-list/branch` use raw `prefers-color-scheme` instead of `cc.theme` (MD-01).
- The shell hides the rail at ≤ 820 without a drawer to reopen it (Mobile chapter).
- Outstanding long-list adopters: Invoice Audit, Price List Review, Categorize Price Lines, Credit Memos, Agreement Builder.

## Keeping it true

- A change to a token, component, mode, motion or decision updates the matching chapter **in the same PR** (rule G-04). `Design.md` and `standards/design/v1.md` change only when a principle or a pass/fail check changes.
- Rule ids are permanent (G-05). Retire with a note; never renumber.
- New swag or a new logo file → re-run the swag script with `--force` and rewrite the alt text.

## Related

`docs/40-dashboard-design-system.md` · `standards/design/v1.md` · `deployment/remote/dashboard/Design.md` · `config/brand/assets/README.md` · `CONVENTIONS.md` §11 · `docs/109` (runtime lights) · `docs/111` (CRM PWA companion, parity review)
