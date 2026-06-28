# A3 — Google Search Console API (DevTeam allow)

**Status:** allow — read-only URL Inspection + sitemap coverage  
**Owner:** SEO Engineer  
**ROI:** Confirmed Google index status for proexteriorsus.com (`indexing-sitemap-health` skill); separates crawl readiness from indexed reality.

## Scope

Service account JSON via `GOOGLE_APPLICATION_CREDENTIALS` (or `GSC_SERVICE_ACCOUNT_JSON` path). Site property in `GSC_SITE_URL` (must match Search Console property: `sc-domain:proexteriorsus.com` or URL-prefix). Runner: `scripts/seo-gsc-url-inspect.mjs`. **Read-only** scope: `webmasters.readonly`.

## Gate checklist

- [x] License: Google API ToS
- [x] Egress: `searchconsole.googleapis.com` only
- [x] Credentials: service account added as user in GSC property (Viewer sufficient)
- [ ] Human approval: Chris (confirm SA email in GSC)

## Verdict

`allow` — no write/indexing actions; DevTeam technical SEO only. Content EEAT publish decisions remain Lena Brooks (roofing-ops).
