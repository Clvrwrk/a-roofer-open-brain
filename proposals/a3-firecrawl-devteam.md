# A3 — Firecrawl API (DevTeam conditional pilot)

**Status:** conditional_pilot — pending human approval  
**Owner:** SEO Engineer / Tool Manager  
**ROI:** Structured scrape for proexteriorsus.com competitive research and SEO Engineer weekly audits.

## Scope

`FIRECRAWL_API_KEY_DEV` in dev Hermes profiles only (seo-engineer, feature-planner, red-team adversarial URL tests). Never on roofing-ops plane.

## Gate checklist

- [ ] License: Firecrawl ToS
- [ ] Egress: Firecrawl API + explicitly allowlisted domains
- [ ] Spend cap monitored by Tool Manager monthly cron
- [ ] Rollback: revoke key + remove from provision-dev-agent-env.sh
- [ ] Human approval: Chris

## Verdict target

`conditional_pilot` → `allow` after doc 54 review and first SEO weekly audit receipt.
