# Brand

**Design tokens no longer live here (2026-11-04).** The Pro Exteriors design system is **https://ds.proexteriorsus.net**, built from `packages/ds` (`@proexteriors/ds` 1.0.0) in [Clvrwrk/CRM_PWA](https://github.com/Clvrwrk/CRM_PWA); its rules are `packages/ds/RULES.md` (CRM_PWA PR #268 until it merges). Old rule ids are kept in brackets there.

| File | What it is now |
| --- | --- |
| [`DESIGN.md`](./DESIGN.md) | A pointer to ds. Not a token source and not linted. |
| [`assets/`](./assets/) | The legacy logo set (set A). Still read by the Command Center and `scripts/design-system-swag.mjs`; it moves to the ds logo set in a later migration. See [`assets/README.md`](./assets/README.md). |

Deleted on 2026-11-04: `tailwind.theme.json` (a Tailwind v3 export of the old DESIGN.md tokens that nothing rendered from) and the vendored DESIGN.md spec at `standards/design/vendor/design.md/`. The go-live gate (`scripts/verify-deployment.sh`) no longer lints DESIGN.md or checks the Tailwind theme.

Brand identity is still per-client (CONVENTIONS §9), but token values change only in ds (ds rules K-03, G-03).
