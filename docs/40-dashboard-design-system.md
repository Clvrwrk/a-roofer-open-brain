# 40 — Command Center Dashboard Design System (superseded)

**Status:** superseded 2026-11-04 · **Owner:** Cleverwork · **First captured:** 2026-06-17

This doc held the Command Center audit-dashboard look and feel (the Estimate Audit expand tree and the Invoice Audit two-panel queue). It is replaced by the Pro Exteriors design system (`@proexteriors/ds`).

- **Live reference:** https://ds.proexteriorsus.net
- **Rules:** `packages/ds/RULES.md` in [Clvrwrk/CRM_PWA](https://github.com/Clvrwrk/CRM_PWA) (package `@proexteriors/ds` 1.0.0; on branch `claude/pe-design-system-v1`, CRM_PWA PR #268, until it merges)
- **Check:** `node packages/ds/scripts/lint.mjs <app dir>` (in CRM_PWA)

Its rules now live in ds: nested trees (§5) → N-01 to N-14; persisted filter and open state (§6) → F-06; inline edits and recalculation (§5) → B-07; paged reads (§8) → T-11; grouped columns (§5) → T-07.

The old rule ids (`UX-xx`, `CMP-xx`, `M-xx`, `S-xx`, `D-xx`, `A-xx`, `G-xx`, `DSN-xxx` and the other CC/CRM ids) are kept in brackets next to the ds rule that replaced them in ds `RULES.md`, so PRs, issues and docs that cite them still resolve.

Where the old designs disagree, CC/CRM win (Chris, 2026-11-04). Do not add design rules here; change ds instead (ds rule G-03, G-04).

The full previous text is in git history: `git show 8320236b:docs/40-dashboard-design-system.md`.
