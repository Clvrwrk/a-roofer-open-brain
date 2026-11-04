# 45 — Communications Dashboard (design note, superseded)

**Status:** superseded 2026-11-04 · not built

This was a design note (2026-06-19, Agreement Builder review point #4) for a Communications dashboard that tracks every pending outbound communication in one place. Its design guidance is replaced by the Pro Exteriors design system (`@proexteriors/ds`). The product idea itself is unchanged and still not built; a future build follows ds.

- **Live reference:** https://ds.proexteriorsus.net
- **Rules:** `packages/ds/RULES.md` in [Clvrwrk/CRM_PWA](https://github.com/Clvrwrk/CRM_PWA) (package `@proexteriors/ds` 1.0.0; on branch `claude/pe-design-system-v1`, CRM_PWA PR #268, until it merges)
- **Check:** `node packages/ds/scripts/lint.mjs <app dir>` (in CRM_PWA)

The ds rules that cover what this note described: nothing leaves without a human (B-04), confirm text that names scope and recipients (B-03), agent vs human badges (B-08), KPI pills as work queues (P-03).

The old rule ids (`UX-xx`, `CMP-xx`, `M-xx`, `S-xx`, `D-xx`, `A-xx`, `G-xx`, `DSN-xxx` and the other CC/CRM ids) are kept in brackets next to the ds rule that replaced them in ds `RULES.md`, so PRs, issues and docs that cite them still resolve.

Where the old designs disagree, CC/CRM win (Chris, 2026-11-04). Do not add design rules here; change ds instead (ds rule G-03, G-04).

The full previous text is in git history: `git show 8320236b:docs/45-communications-dashboard-design-note.md`.
