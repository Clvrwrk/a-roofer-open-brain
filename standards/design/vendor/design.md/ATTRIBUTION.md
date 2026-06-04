# DESIGN.md format — attribution

The files in this directory are the **DESIGN.md format specification** by **Google Labs**, vendored into this template so a client brain carries its own copy of the design-token contract and can be linted offline-of-this-repo without chasing an upstream URL.

- Project: `design.md` — <https://github.com/google-labs-code/design.md>
- Tooling: `@google/design.md` on npm — <https://www.npmjs.com/package/@google/design.md>
- License: **Apache License 2.0** (see `LICENSE` in this directory)
- Vendored at upstream commit `ad4a4921216cceff8199ba23630eaf0ffe59c849` (monorepo `0.2.0`; spec version `alpha`).

## What's here

| File | Source | Notes |
| --- | --- | --- |
| `spec.md` | upstream `docs/spec.md` | The normative DESIGN.md format spec. Vendored **as-is** (generated header preserved). This is the reference the design standard (`../../v1.md`) enforces against. |
| `LICENSE` | upstream `LICENSE` | Apache-2.0, preserved verbatim as the license requires. |

## How we use it

We adopt the **format**, not a fork of the code. The linter and exporters are
run on demand via `npx @google/design.md` (pinned in `scripts/lint-design.sh`),
which always resolves from the public npm registry — we do **not** vendor the
TypeScript packages. Cleverwork-authored material (the design standard in
`../../v1.md`, the brand file in `config/brand/DESIGN.md`, and the lint wrapper)
is **MIT** and only *references* this spec; it does not copy its prose.

## Licensing

Apache-2.0 is permissive and compatible with this repository's MIT root
(`/LICENSE`). Redistribution requires keeping this `LICENSE` file and the
notice above intact. If you fork this brain, preserve both. Full repo licensing
map: `/LICENSE.md`.
