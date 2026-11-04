# Pro Exteriors Open Brain admin design system: superseded

**Superseded on 2026-11-04** by the Pro Exteriors design system (`@proexteriors/ds`). This file (v1.0, the written spec: principles, five-colour role discipline, Contrast-Layer depth, tokens and components) is no longer a design authority.

- **Live reference:** https://ds.proexteriorsus.net
- **Rules:** `packages/ds/RULES.md` in [Clvrwrk/CRM_PWA](https://github.com/Clvrwrk/CRM_PWA) (package `@proexteriors/ds` 1.0.0; on branch `claude/pe-design-system-v1`, CRM_PWA PR #268, until it merges)
- **Check:** `node packages/ds/scripts/lint.mjs <app dir>` (in CRM_PWA)

Where this spec's rules went: five colour roles (DSN-011) → ds C-01 to C-06; tokens only, no one-off values (DSN-010, DSN-014) → K-01 to K-03; one primary action (DSN-012) → B-01; monospace only for copied codes (DSN-013) → Y-04; borders, not shadows (CMP-12) → L-02.

The old rule ids (`UX-xx`, `CMP-xx`, `M-xx`, `S-xx`, `D-xx`, `A-xx`, `G-xx`, `DSN-xxx` and the other CC/CRM ids) are kept in brackets next to the ds rule that replaced them in ds `RULES.md`, so PRs, issues and docs that cite them still resolve.

`design-system.html` beside this file is the old static styleguide for the legacy static dashboard; it is not an authority either.

Where the old designs disagree, CC/CRM win (Chris, 2026-11-04). Do not add design rules here; change ds instead (ds rule G-03, G-04).

The full previous text is in git history: `git show 8320236b:deployment/remote/dashboard/Design.md`.
