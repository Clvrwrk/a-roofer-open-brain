# Brand — design tokens

This folder holds the **live brand identity** for this client's brain, expressed
in the [DESIGN.md format](../../standards/design/vendor/design.md/spec.md)
(Google Labs, Apache-2.0). It is part of the customization surface (CONVENTIONS
§9): brand identity is a per-client value, so it lives under `config/` next to
`roofer.config.yaml`, not hard-coded anywhere else.

| File | What it is |
| --- | --- |
| [`DESIGN.md`](./DESIGN.md) | The source of truth for design tokens — colors, typography, spacing, radii, and components. The **first design** in this brain: **Pro Exteriors**. |
| [`tailwind.theme.json`](./tailwind.theme.json) | Tailwind v3 `theme.extend` config **derived from** `DESIGN.md`. Generated, not hand-edited; kept in sync by the go-live gate. |
| [`assets/`](./assets/) | Official logo files (full-color + white knockout + favicon) and their usage rules. See [`assets/README.md`](./assets/README.md). |

## How it fits together

- **The format** is vendored at `standards/design/vendor/design.md/` so the brain
  carries its own copy of the spec.
- **The contract** every visual asset must follow is the design standard at
  [`standards/design/v1.md`](../../standards/design/v1.md) — QC owns it, Auditor
  enforces it. Tokens here are normative; the prose explains how to apply them.
- **The tooling** runs on demand via npm — no packages are vendored:

  ```bash
  # lint the brand file (zero errors required before any change ships)
  ./scripts/lint-design.sh config/brand/DESIGN.md

  # export tokens to Tailwind / W3C DTCG instead of re-typing values
  npx @google/design.md export --format json-tailwind config/brand/DESIGN.md > config/brand/tailwind.theme.json
  npx @google/design.md export --format css-tailwind  config/brand/DESIGN.md > theme.css   # Tailwind v4
  npx @google/design.md export --format dtcg          config/brand/DESIGN.md > tokens.json
  ```

  The committed **Tailwind v3 theme** lives at
  [`tailwind.theme.json`](./tailwind.theme.json) (a `theme.extend` object). It is
  derived from `DESIGN.md` and must stay in sync: `scripts/verify-deployment.sh`
  re-derives it and **fails the go-live gate** if it drifts. After any token
  change, regenerate with the `json-tailwind` command above.

  **Token-naming note:** spacing token names must be valid CSS identifiers
  (`/^[a-zA-Z][a-zA-Z0-9-]*$/`) or the Tailwind v4 CSS export rejects them. The
  large-end scale is therefore named `xl-2`…`xl-5` (not `2xl`…`5xl`). Keep new
  tokens letter-leading.

## Changing the brand

Edit `DESIGN.md`, then lint. A token needed repeatedly is promoted to a token in
this file — never search-and-replaced into the codebase, and never bypassed with
a new one-off CSS custom property. Display/heading fonts stay on Phase 1 (Inter)
until the Phase 2 brand pass is explicitly initiated; the token update in
`DESIGN.md` is the trigger. See the Do's and Don'ts in `DESIGN.md` for the full
guard rails.
