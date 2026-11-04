# 112 — The living design system at `/design-system` (superseded)

**Status:** superseded 2026-11-04 · **Owner:** Cleverwork · **Shipped:** 2026-09-14

The Command Center design-system site (`cc.proexteriorsus.net/design-system`: tokens parsed from `global.css`, 18 chapters, the UX decisions log, `/design-system/tokens.json`) is replaced by the Pro Exteriors design system (`@proexteriors/ds`), which was seeded from it.

- **Live reference:** https://ds.proexteriorsus.net
- **Rules:** `packages/ds/RULES.md` in [Clvrwrk/CRM_PWA](https://github.com/Clvrwrk/CRM_PWA) (package `@proexteriors/ds` 1.0.0; on branch `claude/pe-design-system-v1`, CRM_PWA PR #268, until it merges)
- **Check:** `node packages/ds/scripts/lint.mjs <app dir>` (in CRM_PWA)

The CC routes `/design-system` and `/design-system/*` redirect to https://ds.proexteriorsus.net (separate PR, branch `claude/cc-design-system-redirect`). The decisions log's permanent rule ids (`C-`, `CMP-`, `UX-`, `MD-`, `MO-`, `D-`, `M-`, `A-`, `W-`, `P-`, `SW-`, `WEB-`, `G-`) carried over.

The old rule ids (`UX-xx`, `CMP-xx`, `M-xx`, `S-xx`, `D-xx`, `A-xx`, `G-xx`, `DSN-xxx` and the other CC/CRM ids) are kept in brackets next to the ds rule that replaced them in ds `RULES.md`, so PRs, issues and docs that cite them still resolve.

Where the old designs disagree, CC/CRM win (Chris, 2026-11-04). Do not add design rules here; change ds instead (ds rule G-03, G-04).

The full previous text is in git history: `git show 8320236b:docs/112-design-system-site.md`.
