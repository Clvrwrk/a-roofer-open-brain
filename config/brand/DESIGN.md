---
status: superseded
superseded: 2026-11-04
canonical: https://ds.proexteriorsus.net
rules: Clvrwrk/CRM_PWA packages/ds/RULES.md
---

# Pro Exteriors design system: moved to ds.proexteriorsus.net

**Superseded on 2026-11-04** by the Pro Exteriors design system (`@proexteriors/ds`). This file was already a pointer to the CC `/design-system` site and `Design.md`; both of those are now superseded too.

- **Live reference:** https://ds.proexteriorsus.net
- **Rules:** `packages/ds/RULES.md` in [Clvrwrk/CRM_PWA](https://github.com/Clvrwrk/CRM_PWA) (package `@proexteriors/ds` 1.0.0; on branch `claude/pe-design-system-v1`, CRM_PWA PR #268, until it merges)
- **Check:** `node packages/ds/scripts/lint.mjs <app dir>` (in CRM_PWA)

The old rule ids (`UX-xx`, `CMP-xx`, `M-xx`, `S-xx`, `D-xx`, `A-xx`, `G-xx`, `DSN-xxx` and the other CC/CRM ids) are kept in brackets next to the ds rule that replaced them in ds `RULES.md`, so PRs, issues and docs that cite them still resolve.

There is no DESIGN.md lint or Tailwind theme export any more: `config/brand/tailwind.theme.json` and the vendored DESIGN.md spec were deleted on 2026-11-04, and tokens come only from ds `dist/tokens.css` (`--pe-*`, ds rule K-01).

Where the old designs disagree, CC/CRM win (Chris, 2026-11-04). Do not add design rules here; change ds instead (ds rule G-03, G-04).

The full previous text is in git history: `git show 8320236b:config/brand/DESIGN.md`.
