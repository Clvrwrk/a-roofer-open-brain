---
type: runbook
title: Release Day — Command Center and marketing deploy
description: Preflight, deploy, smoke, rollback for cc.proexteriorsus.net and proexteriorsus.com.
tags: [release, dev-team, open-skills, pec-3]
timestamp: "2026-06-28"
---

# Release Day Runbook

## Preconditions

- Branch merged to deploy branch (`origin/main`)
- Red Team Cycle 3 pass receipt on milestone issue
- `node scripts/open-engine-preflight.mjs` green

## Steps

1. **Preflight** — `cd app/command-center && npm run build`
2. **PageSpeed gate** — run `pagespeed-95-gate` skill on `seo-maintenance.config.json` criticalPages
3. **Deploy** — Coolify auto-build from GitHub push; confirm `/healthz` buildCommit
4. **Smoke** — `/healthz`, WorkOS login, one authenticated warm route
5. **Sentry** — zero new P0 in 15 minutes post-deploy
6. **Receipt** — post `AGENT DONE` on Linear release issue with commit SHA

## Rollback

- Coolify: redeploy previous successful build
- Post incident to `#ob-dev-incidents` if P0

## Owners

- Dev Conductor (Chris-facing summary)
- Security Guardian (deploy webhook scan)
- SEO Engineer (PageSpeed gate)
