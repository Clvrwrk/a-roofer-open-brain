---
type: runbook
title: SEO Weekly Audit — proexteriorsus.com
description: Screaming Frog crawl diff + PageSpeed 95 gate + DataForSEO Lighthouse fallback + GSC URL Inspection + Linear filing for seo-regression issues.
tags: [seo, dev-team, seo-engineer, dataforseo, gsc]
timestamp: "2026-06-28"
---

# SEO Weekly Audit Runbook

## Scope

- **Technical SEO (DevTeam):** proexteriorsus.com CWV, crawl errors, schema, sitemaps, **confirmed Google index status (GSC)**
- **Content EEAT (Roofing-Ops):** Lena Brooks — handoff via `#ob-dev-team` for copy changes only

## Prerequisites

| Tool | Env vars | Runner |
| --- | --- | --- |
| PageSpeed Insights (primary) | `PAGESPEED_API_KEY` | `pagespeed-95-gate` skill |
| DataForSEO Lighthouse (fallback) | `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD` | `node scripts/seo-dataforseo-lighthouse.mjs` |
| Google Search Console | `GSC_SITE_URL`, `GSC_SERVICE_ACCOUNT_JSON` | `node scripts/seo-gsc-url-inspect.mjs` |

Config: `seo-maintenance.config.json` (`searchConsoleSiteUrl`, `criticalPages`, `sitemapIndex`).

## Weekly cadence (Mon 6am CT)

1. Load `seo-maintenance.config.json` criticalPages
2. **Screaming Frog** — full crawl of proexteriorsus.com; diff vs last baseline in `reports/`
3. **PageSpeed 95 gate** — mobile + desktop via PSI; all four categories ≥ 0.95
4. **DataForSEO Lighthouse** — run when PSI quota errors or for cross-check; output `reports/seo-maintenance/dataforseo-lighthouse-latest.json`
5. **GSC URL Inspection** — every marketing criticalPage; report `confirmedGoogleIndexScore` (never assume 100% without GSC)
6. **Indexing readiness** — `indexing-sitemap-health` skill: robots, sitemap, noindex vs `indexableRouteGroups`
7. File Linear issues:
   - Label `seo-regression` for gate failures or GSC not-indexed critical URLs
   - Title `[agent instructions][pe-cc-cursor][task] SEO fix: <page> <category>`
8. Post summary to `#ob-dev-team` (silent if all green)

## Scoring rules

- **CWV pass:** PSI and/or DataForSEO — all four Lighthouse categories ≥ 0.95 (mobile + desktop)
- **Index pass:** GSC confirms indexed for 100% of intended marketing URLs; if credentials missing → `confirmedGoogleIndexScore: not_available` (warn, not pass)

## Monthly

- Competitive SERP snapshot via Tavily/Exa (dev keys only)
- Update baseline crawl archive

## Release gate

No marketing deploy without PageSpeed pass on changed URLs (see Release Day runbook). GSC re-check within 48h of deploy for changed URLs.
