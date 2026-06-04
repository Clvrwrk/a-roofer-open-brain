---
version: alpha
name: Pro Exteriors
description: >
  Canonical visual identity for the Pro Exteriors website — a national
  commercial and residential exterior contractor headquartered in Dallas-Fort
  Worth. Five-color brand palette anchored by deep navy authority and flag red
  interaction, paired with Inter as the deployed primary typeface and IBM Plex
  Mono for Property Card surfaces. This file is the source of truth for design
  tokens; all components, CSS variables, and Tailwind extensions derive from it.

colors:
  # ── Brand palette ──────────────────────────────────────────────────────
  # Five colors. Each carries a single non-negotiable role. Do not swap roles.
  primary: "#11133F"              # deep navy — B2B authority, body text, dark surfaces
  primary-container: "#0a0c27"    # deep navy dark — hover / active state
  primary-soft: "#bbbeed"         # deep navy tint — light section background
  on-primary: "#FFFFFF"           # 16.8:1 on primary
  on-primary-soft: "#11133F"
  secondary: "#3b6b4c"            # hunter green — brand voice, residential warmth
  secondary-container: "#24412e"  # hunter green dark — hover / active
  secondary-soft: "#d3e7da"       # hunter green tint
  on-secondary: "#FFFFFF"         # 5.6:1 on secondary
  on-secondary-soft: "#11133F"
  tertiary: "#c22326"             # flag red — SOLE CTA / interaction color
  tertiary-container: "#9b1c1f"   # flag red dark — button hover
  on-tertiary: "#FFFFFF"          # 5.0:1 on tertiary
  accent: "#eaa221"               # golden orange — eyebrows, callouts, badges
  accent-soft: "#fbedd2"          # golden orange tint — stat callout background
  on-accent: "#000000"            # 10.0:1 on accent
  on-accent-soft: "#11133F"
  info: "#0066cc"                 # smart blue — inline links, secondary actions
  info-soft: "#c2e0ff"            # smart blue tint
  on-info: "#FFFFFF"              # 5.4:1 on info
  on-info-soft: "#11133F"
  # ── Surface system ─────────────────────────────────────────────────────
  surface: "#FFFFFF"              # default page / card background
  surface-elevated: "#FFFFFF"     # modals, dropdowns, elevated cards
  surface-inset: "#F9FAFB"        # alternate section fill, input backgrounds
  surface-alt: "#F3F4F6"          # subtle separation on white
  surface-dark: "#111827"         # dark hero overlays, inverted sections
  on-surface: "#111827"           # primary body text on white — 16.75:1
  on-surface-secondary: "#374151" # secondary body text — 9.33:1
  on-surface-muted: "#4B5563"     # captions, metadata — 7.26:1
  on-surface-dark: "#FFFFFF"      # text on dark surfaces
  # ── Border ─────────────────────────────────────────────────────────────
  border: "#E5E7EB"
  border-subtle: "#F3F4F6"
  # ── Status ─────────────────────────────────────────────────────────────
  success: "#059669"
  warning: "#D97706"
  error: "#DC2626"                # live CSS value; brand tertiary is #c22326 — close but distinct
  error-surface: "#FEF2F2"
  error-text: "#7F1D1D"

typography:
  # Primary typeface: Inter (deployed Phase 1).
  # Phase 2 brand pass will migrate display/heading weights to Archivo variable font.
  display-1:
    fontFamily: Inter
    fontSize: 60px
    fontWeight: "800"
    lineHeight: 1.05
    letterSpacing: -0.025em
  display-2:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: "800"
    lineHeight: 1.1
    letterSpacing: -0.02em
  h1:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: "700"
    lineHeight: 1.15
    letterSpacing: -0.02em
  h2:
    fontFamily: Inter
    fontSize: 30px
    fontWeight: "700"
    lineHeight: 1.2
    letterSpacing: -0.015em
  h3:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: "600"
    lineHeight: 1.25
  h4:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: "600"
    lineHeight: 1.3
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: "400"
    lineHeight: 1.6
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: "400"
    lineHeight: 1.6
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: "400"
    lineHeight: 1.55
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: "600"
    lineHeight: 1.4
    letterSpacing: 0.01em
  label-caps:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: "700"
    lineHeight: 1.3
    letterSpacing: 0.1em
  # Secondary typeface: IBM Plex Mono — Property Card surfaces only.
  # The mono token is the visual signal of "this is the place-memory artifact."
  mono-md:
    fontFamily: IBM Plex Mono
    fontSize: 14px
    fontWeight: "400"
    lineHeight: 1.5
  mono-sm:
    fontFamily: IBM Plex Mono
    fontSize: 12px
    fontWeight: "400"
    lineHeight: 1.5

spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  xl-2: 48px
  xl-3: 64px
  xl-4: 96px
  xl-5: 128px
  gutter: 24px
  section: 96px
  section-mobile: 48px
  container-max: 1280px

rounded:
  none: 0
  sm: 4px
  md: 8px
  lg: 12px
  xl: 16px
  full: 9999px

components:
  button-primary:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.on-tertiary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
    padding: 12px
    height: 48px
  button-primary-hover:
    backgroundColor: "{colors.tertiary-container}"
    textColor: "{colors.on-tertiary}"
  button-secondary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
    padding: 12px
    height: 48px
  button-secondary-hover:
    backgroundColor: "{colors.primary-container}"
    textColor: "{colors.on-primary}"
  button-ghost:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
    padding: 12px
    height: 48px
  button-ghost-hover:
    backgroundColor: "{colors.surface-alt}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.md}"
    padding: 24px
  card-alt:
    backgroundColor: "{colors.surface-inset}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.md}"
    padding: 24px
  card-dark:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
    padding: 24px
  hero-overlay-commercial:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.display-1}"
  hero-overlay-residential:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.on-secondary}"
    typography: "{typography.display-1}"
  stat-callout:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.on-accent-soft}"
    rounded: "{rounded.md}"
    padding: 16px
  testimonial-quote:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-lg}"
    rounded: "{rounded.xl}"
    padding: 56px
  nav-link:
    textColor: "{colors.on-surface-secondary}"
    typography: "{typography.label-md}"
  nav-link-active:
    textColor: "{colors.tertiary}"
  nav-dropdown:
    backgroundColor: "{colors.surface-elevated}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.md}"
    padding: 16px
  service-tile:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.md}"
    padding: 24px
  partner-logo-strip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface-muted}"
  faq-item:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
    padding: 16px
  certification-badge:
    backgroundColor: "{colors.surface-inset}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.md}"
    padding: 12px
  property-card-callout:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.primary}"
    typography: "{typography.mono-md}"
    rounded: "{rounded.xl}"
    padding: 24px
  footer:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.body-sm}"
  link-inline:
    textColor: "{colors.info}"
    typography: "{typography.body-md}"
  info-callout:
    backgroundColor: "{colors.info-soft}"
    textColor: "{colors.on-info-soft}"
    rounded: "{rounded.md}"
    padding: 16px
  input-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: 12px
    height: 48px
  input-field-focus:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
  leadership-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.xl}"
    padding: 20px
  section-dark:
    backgroundColor: "{colors.surface-dark}"
    textColor: "{colors.on-surface-dark}"
  section-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
  section-brand-red:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.on-tertiary}"
  section-soft-primary:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.on-primary-soft}"
  section-soft-secondary:
    backgroundColor: "{colors.secondary-soft}"
    textColor: "{colors.on-secondary-soft}"
  callout-value:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.label-caps}"
    rounded: "{rounded.full}"
    padding: 8px
  card-bordered:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.md}"
    padding: 24px
  alert-success:
    backgroundColor: "{colors.success}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.sm}"
    padding: 12px
  alert-warning:
    backgroundColor: "{colors.warning}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.sm}"
    padding: 12px
  alert-error:
    backgroundColor: "{colors.error-surface}"
    textColor: "{colors.error-text}"
    rounded: "{rounded.sm}"
    padding: 12px
  divider:
    backgroundColor: "{colors.border}"
  divider-subtle:
    backgroundColor: "{colors.border-subtle}"
---

# Pro Exteriors — Design System

## Overview

Place-Memory Heritage meets Texas-Bold Trade-Tech. Pro Exteriors is a national commercial and residential exterior contractor based in Dallas-Fort Worth. The visual identity must read "the contractor who already knows your street" before it reads "roofer," operating simultaneously across two distinct audiences: commercial procurement officers who evaluate contractors on institutional credibility and portfolio-level execution, and residential homeowners who respond to trust signals, local presence, and craftsmanship proof.

The brand operates on five colors, two typefaces, and one interaction CTA. That constraint is the brand. Discipline here is not a creative limitation — it is what separates a company that looks institutional from one that looks promotional.

**Commercial bias first.** 80% of Pro Exteriors' revenue is commercial. Every default design decision — color weight, section density, typographic tone — should read "institutional contractor" before it reads "residential roofer." The residential audience adjusts via hunter green warmth, not by compromising the primary commercial authority.

**Faith-aligned, not faith-branded.** The company's Christian values (#BuiltOnFaith, Trust/Honor/Integrity) are expressed through tone — directness, accountability, character — not through religious iconography or overt religious language in the UI.

## Colors

The palette assigns each of five colors a non-negotiable role. The roles do not overlap.

- **Deep Navy (#11133F) — Primary.** The B2B authority color. Body text, dark section surfaces, hero overlays for the commercial vertical, the footer. The color a procurement officer sees and reads as "this company operates at scale." Used in every context where authority matters more than warmth.
- **Hunter Green (#3b6b4c) — Secondary.** The brand voice color. Heritage, growth, place-memory — the visual signal of "we know your neighborhood." Reserved for brand-voice surfaces, residential hero overlays, and Pro Ministries contexts. Used sparingly relative to navy because scarcity is what makes it feel like the brand's personality rather than its wallpaper.
- **Flag Red (#c22326) — Tertiary / Sole CTA.** Bold, patriotic-craft, decisive — right for a Texas-headquartered roofing company. Every primary call-to-action on the site uses this color and only this color. If flag red appears on a non-interactive element, it has been misused. If it appears on every section, it stops working as the interaction signal.
- **Golden Orange (#eaa221) — Accent.** Warmth and attention. Eyebrow tags above section headlines, stat callout soft backgrounds (#fbedd2), the community-color for Pro Ministries sections, warning status. Black text on golden orange passes 10:1 contrast. Never use as a button color or section background.
- **Smart Blue (#0066cc) — Info / Links.** The link color, distinct from navy in role: smart blue means "action / navigate," navy means "surface / authority." Inline body links, "learn more" secondary actions, info status chips. Consistent use ensures users develop accurate click-affordance intuition.

**Contrast verification** (WCAG AA, 4.5:1 minimum for normal text):

| Foreground | Background | Ratio | Status |
|---|---|---|---|
| #FFFFFF | #11133F (primary) | 16.8:1 | ✓ |
| #FFFFFF | #3b6b4c (secondary) | 5.6:1 | ✓ |
| #FFFFFF | #c22326 (tertiary) | 5.0:1 | ✓ |
| #000000 | #eaa221 (accent) | 10.0:1 | ✓ |
| #FFFFFF | #0066cc (info) | 5.4:1 | ✓ |
| #11133F | #FFFFFF (surface) | 16.8:1 | ✓ |
| #11133F | #fbedd2 (accent-soft) | 15+:1 | ✓ |
| #374151 | #FFFFFF (on-surface-secondary) | 9.3:1 | ✓ |

One caution: `on-surface-muted` (#4B5563) on `surface-alt` (#F3F4F6) falls below 4.5:1 in some browser color profiles. Use `on-surface` (#111827) on `surface-alt` instead. See Do's and Don'ts.

## Typography

Two typefaces. One rule about when each is used.

**Inter** is the deployed primary typeface for all text on the site (Phase 1). It is a humanist sans-serif with excellent legibility at small sizes — neutral enough to not distract from the institutional authority of the copy, readable enough for the information-dense commercial audience. Weights used: 400 (body), 600 (labels, h3/h4), 700 (h1/h2), 800 (display, hero). Self-hosted via `@fontsource/inter` — no CDN render-block.

**Note on Phase 2:** The design intent (documented in `/tech/DESIGN.md` v1.1) specified Archivo as the display/heading typeface for its architectural, trades-tech character. Phase 2 brand pass will migrate display and heading tokens to Archivo Variable (`@fontsource-variable/archivo`) while keeping Inter for body copy. Agents should not migrate to Archivo until the Phase 2 brand pass is explicitly initiated — the token update in this file is the trigger.

**IBM Plex Mono** is the secondary typeface, reserved exclusively for Property Card surfaces. The monospace type is the visual signal of the "place-memory artifact" — the Selectric II / Rolodex aesthetic that makes the Property Card feel like a record rather than a marketing card. If any other surface starts using mono, the Property Card loses its unique identity. The mono usage is non-negotiable.

**Typography scale decisions:** display sizes use tight letter-spacing (-0.025em / -0.02em) for editorial gravity; `label-caps` uses wide letter-spacing (0.1em) for eyebrow tags. Line heights favor readability (1.6 for body) over density. The display-to-body ratio is deliberate — a 60px hero H1 against 16px body creates authority hierarchy on landing.

## Layout & Spacing

**Grid:** 12 columns desktop, 6 tablet, 4 mobile. All section content containers use 90% viewport width (`w-[90%] mx-auto`) with auto-centering — this gives 5% margin left/right at any viewport width. No hard pixel maximum on content width at this stage.

**Spacing scale:** 4px base unit, standard 8-point grid progression. Tokens: `xs` (4px) for micro-adjustments, `sm` (8px) for inline gaps, `md` (16px) for component padding, `lg` (24px) for card internal padding, `xl` (32px) for hero/testimonial padding, `xl-2`–`xl-5` (48–128px) for section rhythm.

**Section vertical rhythm:** `section` (96px) desktop, `section-mobile` (48px) mobile. Applied as `py-24` / `py-16` in Tailwind. Sections alternate between light and dark backgrounds rather than relying on spacing alone to create visual separation — the contrast break is the divider.

**Content width:** the 90% / 5% pattern applies to all sections. Full-bleed sections (hero backgrounds, CTA bands, dark section fills) use `w-full` on the outer element, with the 90% inner container controlling readable content width.

## Elevation & Depth

Pro Exteriors uses a **Contrast-Layer** depth model, not a shadow-based model. Visual hierarchy is established through background color alternation, not elevation shadows.

Depth hierarchy:

- **Level 1 — Page foundation:** `surface` (#FFFFFF) or `surface-inset` (#F9FAFB) — the base for most sections.
- **Level 2 — Brand dark surfaces:** `primary` (#11133F) or `surface-dark` (#111827) — dark sections that "drop" the content visually by reversing the light/dark relationship. Used for hero overlays, CTA bands, footer, and emphasis sections.
- **Level 3 — Interactive surfaces:** cards on dark backgrounds use `surface` (#FFFFFF) or `surface-elevated` (#FFFFFF) with a `ring-1 ring-border` 1px border to float them above the dark section floor.
- **Level 4 — Modals / dropdowns:** same as Level 3 but with `shadow-xl` for genuine spatial separation from the page.

**Shadows** are used only for modals, dropdown panels, and the office-contact card in the map component. Card-level shadows are avoided on light sections — the border ring (`ring-1 ring-border`) provides the necessary separation without shadow weight that competes with the brand's flat, direct character.

The map component (`OfficeLocationsMap.tsx`) is the one glassmorphism-adjacent surface: dark card wrapper (`rounded-3xl shadow-xl ring-1`) on desktop. On mobile, the card is removed — the map renders flush with 5% side margins for maximum data density on small screens.

## Shapes

**Architectural Sharpness with Controlled Softness.** The roofing/construction industry defaults to either overly sharp (institutional, cold) or overly rounded (friendly, non-serious). Pro Exteriors uses `md` (8px) as the default radius — enough to read "modern and considered," not enough to read "SaaS startup."

- **`sm` (4px):** FAQ items, input fields, partner logo strips, disclosure notices.
- **`md` (8px):** all buttons, standard cards, service tiles, nav dropdowns. The default.
- **`lg` (12px):** hero overlay panels, modal dialogs.
- **`xl` (16px):** leadership headshot cards, testimonial quote cards, the Property Card callout. The warmer/softer end of the scale — used when human connection is the content.
- **`full` (9999px):** pills, certification badges, status chips.

No component mixes `xl` and `sm` radii in the same visual group. When multiple cards appear together, they use a uniform radius.

## Components

**Buttons** follow a strict three-variant hierarchy. `button-primary` (flag red) is the only CTA that earns clicks — used once per viewport. `button-secondary` (deep navy) is the institutional B2B secondary action. `button-ghost` (white surface, navy text) is used on dark section backgrounds where the primary is already present. Button heights are fixed at 48px for consistent tap targets (≥ 44px WCAG requirement).

**Cards** use `card` (white, 24px padding, 8px radius) for light sections and `card-dark` (navy, 24px padding) for dark section content. The `card-alt` variant uses `surface-inset` for subtle differentiation on white-background sections. All card borders use the `ring-1 ring-border` pattern (1px #E5E7EB), never a box-shadow on light sections.

**Hero overlays** have two variants: `hero-overlay-commercial` (deep navy — procurement officer gravitas) and `hero-overlay-residential` (hunter green — homeowner warmth). The homepage hero uses `surface-dark` (#111827) with a 75% opacity overlay on the video/image background. Commercial and residential section heroes use the appropriate variant.

**The testimonial card** (`testimonial-quote`) breaks from the standard card: `rounded-xl` (16px), 56px padding, a left `border-l-4 border-tertiary` red accent to signal "real human voice." On the `section-brand-red` background, the card renders white.

**Leadership cards** (`leadership-card`) are the only components where the image sits above the text (`aspect-square object-cover` with `object-top`) and the radius is `xl`. The human photo requires warmer container treatment than a data card.

**The Property Card callout** (`property-card-callout`) uses mono typography and `accent-soft` background. These choices are identity-locked — the Selectric II aesthetic is a deliberate product differentiator.

**The map** (`OfficeLocationsMap`) is a React island with its own inline style system. Desktop renders inside a `rounded-3xl shadow-xl` card wrapper. Mobile renders without the card, legend hidden. The `showLegend` and `title` props control this split. State color encoding: flag red for active office states, deep navy for licensed states.

## Do's and Don'ts

- **DO** use `button-primary` (flag red) for one CTA per viewport. When two actions are needed side by side, the secondary is `button-secondary` (navy) or a `button-ghost`. Never two flag-red CTAs in the same visual field.
- **DO** alternate section backgrounds (light/dark) to create visual rhythm. The pattern running through the homepage — white → dark-navy → white → dark-navy/red → white → dark-navy — is intentional. Removing alternation makes the page visually flat.
- **DO** use `label-caps` typography (12px / weight 700 / tracking 0.1em) for all section eyebrows — the small uppercase tag above an H2 that identifies the section type. This is one of the most consistent typographic signals on the site.
- **DO** run `npx @google/design.md lint DESIGN.md` (or `scripts/lint-design.sh`) after any token change. It catches broken token references, WCAG contrast violations in component definitions, missing required sections, and orphaned tokens.
- **DO** use `mono-md` / `mono-sm` only on Property Card surfaces. If another component starts requesting mono typography, ask whether it should be promoted to the Property Card product, not whether mono should spread.
- **DON'T** use `on-surface-muted` (#4B5563) as text on `surface-alt` (#F3F4F6). The contrast falls below 4.5:1 in some browser color profiles. Use `on-surface` (#111827) instead.
- **DON'T** use flag red for decorative purposes. Status-error reuses flag red only because errors are interaction triggers. A decorative red stripe, icon tint, or background wash — even brand-aligned — is forbidden. Diluting the CTA signal is costly.
- **DON'T** use hunter green on commercial-audience-primary surfaces. The commercial procurement audience is reading institutional authority first. Hunter green on a commercial hero or card feels residential. Deep navy reads institutional. Reserve hunter green for brand-voice moments, Pro Ministries sections, and residential contexts.
- **DON'T** use golden orange as a button background or interactive trigger. It is an attention color and a warmth color — not an interaction color. The only interactive use of orange is the star rating icon (`fill-orange-500`), which carries a universal semantic meaning that overrides this rule.
- **DON'T** change the typeface tokens without updating `/tech/DESIGN.md`, `tailwind.config.mjs`, `tokens.css`, and verifying the font is loaded in `global.css`. The font pipeline has four touch points — partial updates cause rendering regressions.
- **DON'T** introduce new CSS custom properties that bypass the token system (`--brand-pe-red`, etc.). If a value is needed repeatedly, promote it to a token in this file. The point of DESIGN.md is that brand changes happen in one file, not through codebase search-and-replace.
