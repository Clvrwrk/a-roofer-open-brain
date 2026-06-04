# Brand assets — logo

Official Pro Exteriors logo files. This folder is the **canonical master**; the
dashboard (and any future surface) keeps a copy under its own `assets/` and is
provisioned from here.

## Files

| File | Use | Source | Notes |
| --- | --- | --- | --- |
| `pro-exteriors-logo.svg` | Primary horizontal logo, full color | **Official artwork** (client-supplied `350x180 lgt.svg`) | Navy roof + navy "PRO" + flag-red "EXTERIORS / LLC". "lgt" = light-background version; use on **light** surfaces only (white / `surface` / `surface-inset`). |
| `pro-exteriors-mark-square.svg` | Square lockup | **Official artwork** (client-supplied `Favicon 500x500 lgt.svg`) | The logo composed into a 500×500 square. Usable as a large app icon; a little tight at favicon sizes (see below). |
| `favicon.svg` | Browser tab / app icon | Cleverwork stand-in | Lightweight roof mark, legible at 16–32px where the full wordmark isn't. Swap for an official roof-only export when available. |
| `pro-exteriors-logo-white.svg` | Knockout / reversed | Cleverwork stand-in | All-white version for deep-navy / dark surfaces. **Placeholder** until an official reversed ("dark" / white) export is supplied — the supplied files are light-background only. |

> The official SVGs are full traced vector (~2.4 MB each). Fine for the web, but
> consider running them through an SVG optimizer (e.g. SVGO) before shipping the
> production site if payload matters. The admin dashboard places the full-color
> logo on a white chip so it reads on the navy rail.

> **Still needed from the client:** an official **reversed / white** logo for
> dark surfaces, and ideally a tight **roof-only** mark for favicons.

## Color + usage rules (governed by `../../../standards/design/v1.md`)

- The logo's two ink colors **are** the brand anchors: deep navy `primary`
  (#11133F) and flag-red `tertiary` (#c22326). Keep them; do not recolor.
- **Clear space:** keep padding equal to the height of the roof mark on all
  sides. Don't crowd the logo with text or other marks.
- **Minimum width:** ~120px for the horizontal lockup so "EXTERIORS LLC" stays
  legible. Below that, use the roof mark / favicon alone.
- **Backgrounds:** full-color logo on white / `surface` / `surface-inset` only.
  On navy or any dark surface, use the white knockout variant.
- **Don't** add shadows, gradients, outlines, or place the logo on a busy photo
  without a solid backing panel. **Don't** stretch or change the aspect ratio.
- Flag red here is part of the *logo*, not a CTA — it does not count against the
  "one flag-red CTA per viewport" rule, but don't introduce additional flag-red
  decoration around it.
